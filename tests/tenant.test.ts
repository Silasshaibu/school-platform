/**
 * Tenant isolation: lib/db.ts tenantDb() must scope every read and stamp every
 * write with the school id, across all operation types.
 */
import {
  tx, test, assert, assertEqual, rebuildSchema, summary, truncateAll, DEV_URL, TEST_URL,
} from "./harness";

async function main() {
  rebuildSchema(DEV_URL, TEST_URL);

  // Import AFTER env + shims are in place (lib/db reads DATABASE_URL at import).
  const { tenantDb } = await import("@/lib/db");

  const a = await tx.school.create({ data: { slug: "a", name: "A" } });
  const b = await tx.school.create({ data: { slug: "b", name: "B" } });
  const dbA = tenantDb(a.id);
  const dbB = tenantDb(b.id);

  await test("create stamps schoolId automatically", async () => {
    const s = await dbA.subject.create({ data: { schoolId: a.id, name: "Maths" } });
    assertEqual(s.schoolId, a.id, "stamped on returned row");
    const raw = await tx.subject.findUniqueOrThrow({ where: { id: s.id } });
    assertEqual(raw.schoolId, a.id, "stamped in the database");
  });

  await test("create honours an explicit foreign schoolId? (documented limitation)", async () => {
    // The extension spreads { ...data, schoolId } so a caller-supplied schoolId
    // is overwritten — verify that holds.
    const s = await dbA.guardian.create({ data: { name: "X", phone: "08000000000", schoolId: b.id } as any });
    assertEqual(s.schoolId, a.id, "extension must win over supplied schoolId");
  });

  await test("findMany is scoped to the tenant", async () => {
    await dbB.subject.create({ data: { schoolId: b.id, name: "Biology" } });
    const listA = await dbA.subject.findMany();
    const listB = await dbB.subject.findMany();
    assert(listA.every((s) => s.schoolId === a.id), "A sees only A's subjects");
    assert(listB.every((s) => s.schoolId === b.id), "B sees only B's subjects");
    assert(!listA.some((s) => s.name === "Biology"), "A cannot read B's row");
  });

  await test("findFirst / count are scoped", async () => {
    const found = await dbA.subject.findFirst({ where: { name: "Biology" } });
    assert(found === null, "A cannot findFirst B's subject");
    assertEqual(await dbA.subject.count(), 2);
    assertEqual(await dbB.subject.count(), 1);
  });

  await test("updateMany / deleteMany cannot touch other tenants", async () => {
    const upd = await dbA.subject.updateMany({ where: {}, data: { name: "HACKED" } });
    assertEqual(upd.count, 2, "only A's two rows updated");
    const bRow = await tx.subject.findFirstOrThrow({ where: { schoolId: b.id } });
    assert(bRow.name !== "HACKED", "B's row untouched");

    const del = await dbA.subject.deleteMany({ where: {} });
    assertEqual(del.count, 2);
    assertEqual(await tx.subject.count({ where: { schoolId: b.id } }), 1, "B's row survives");
  });

  await test("interactive $transaction carries the extension", async () => {
    await dbA.$transaction(async (t) => {
      const s = await t.subject.create({ data: { schoolId: a.id, name: "Civic" } });
      assertEqual(s.schoolId, a.id, "create inside tx is stamped");
      const n = await t.subject.count();
      assertEqual(n, 1, "reads inside tx are scoped");
    });
    const leaked = await dbB.subject.findFirst({ where: { name: "Civic" } });
    assert(leaked === null, "row created in A's tx invisible to B");
  });

  await test("array-form $transaction carries the extension", async () => {
    await Promise.all([]); // keep signature simple; run real array form:
    const [made] = await dbA.$transaction([
      dbA.feeItem.create({ data: { schoolId: a.id, name: "Sports" } }),
      dbA.feeItem.count(),
    ]);
    assertEqual(made.schoolId, a.id, "create in array tx is stamped");
  });

  await test("aggregate/groupBy respect scope", async () => {
    await dbB.feeItem.create({ data: { schoolId: b.id, name: "B-only item" } });
    const max = await dbA.feeItem.aggregate({ _count: { id: true } });
    assertEqual(max._count.id, 1, "A counts only its own fee items");
  });

  await test("non-tenant models pass through unscoped", async () => {
    const schools = await dbA.school.findMany();
    assert(schools.length >= 2, "School queries are not filtered (by design)");
  });

  await test("cross-tenant nested read via relation returns nothing", async () => {
    const cls = await dbA.schoolClass.create({ data: { schoolId: a.id, name: "P1", level: 1 } });
    await dbA.student.create({
      data: {
        schoolId: a.id,
        admissionNo: "A/1", firstName: "Ann", lastName: "A", dob: new Date("2019-01-01"),
        gender: "F", classId: cls.id,
      },
    });
    const bSee = await dbB.student.findMany();
    assertEqual(bSee.length, 0, "B cannot see A's students");
  });

  await truncateAll();
  summary("tenant isolation");
  await tx.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
