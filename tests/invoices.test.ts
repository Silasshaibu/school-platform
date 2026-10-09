/**
 * Invoice generation: totals from fee structure, sibling discount applied only
 * to second-and-later children (by primary guardian phone), idempotent re-runs.
 */
import { tx, test, assert, assertEqual, rebuildSchema, summary, truncateAll, DEV_URL, TEST_URL, setSchoolSlug } from "./harness";
import { make } from "./fixtures";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  rebuildSchema(DEV_URL, TEST_URL);

  const f = await make();
  const { POST } = await import("@/app/api/invoices/generate/route");
  const { createSession } = await import("@/lib/auth");
  await createSession({ uid: f.admin.id, role: "ADMIN", schoolId: f.demo.id });
  setSchoolSlug("demo");

  const gen = (body: object) =>
    POST(new Request("http://demo.localhost:3000/api/invoices/generate", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }) as any);

  await test("first child pays full, siblings get the percentage off", async () => {
    const r = await gen({ termId: f.term.id });
    assertEqual(r.status, 200);
    const j = await r.json();
    assertEqual(j.created, 5, "five active demo students");
    assertEqual(j.classesWithoutFees, 0);

    const invs = await tx.invoice.findMany({ where: { termId: f.term.id }, orderBy: { studentId: "asc" } });
    assertEqual(invs.length, 5);
    const byStudent = Object.fromEntries(invs.map((i) => [i.studentId, i]));
    // Total per class = 5,000.00 + 1,000.00 = 6,000.00 (600000 kobo)
    assertEqual(byStudent[f.ada.id].totalKobo, 600000);
    assertEqual(byStudent[f.ada.id].discountKobo, 0, "first Okafor child: no discount");
    assertEqual(byStudent[f.zara.id].totalKobo, 600000);
    assertEqual(byStudent[f.zara.id].discountKobo, 60000, "second Okafor child: 10% of 600000");
    assertEqual(byStudent[f.ben.id].discountKobo, 0, "only child: no discount");
  });

  await test("invoice lines match the fee structure", async () => {
    const inv = await tx.invoice.findFirstOrThrow({ where: { studentId: f.ada.id, termId: f.term.id }, include: { lines: true } });
    assertEqual(inv.lines.length, 2);
    const total = inv.lines.reduce((t, l) => t + l.amountKobo, 0);
    assertEqual(total, inv.totalKobo, "lines sum to invoice total");
    assertEqual(new Set(inv.lines.map((l) => l.schoolId)).size, 1);
    assertEqual(inv.lines[0].schoolId, f.demo.id, "lines stamped with tenant id");
  });

  await test("re-running is idempotent (skips existing invoices)", async () => {
    const r = await gen({ termId: f.term.id });
    const j = await r.json();
    assertEqual(j.created, 0);
    assertEqual(j.skippedExisting, 5);
    assertEqual(await tx.invoice.count({ where: { termId: f.term.id } }), 5, "no duplicate invoices");
  });

  await test("classId filter only bills that class", async () => {
    // Zara sits in P2 and already has an invoice; add a fresh P2 student.
    const late = await tx.student.create({
      data: { schoolId: f.demo.id, admissionNo: "DEM/2026/0099", firstName: "Late", lastName: "Joiner", dob: new Date("2019-01-01"), gender: "F", classId: f.p2.id },
    });
    const r = await gen({ termId: f.term.id, classId: f.p2.id });
    const j = await r.json();
    assertEqual(j.created, 1, "only the new P2 student got an invoice");
    const inv = await tx.invoice.findFirstOrThrow({ where: { studentId: late.id } });
    assertEqual(inv.discountKobo, 0, "third distinct family member ranking: Joiner is first of her family");
    void assert;
  });

  await test("third sibling also gets the discount (rank > 0)", async () => {
    const third = await tx.student.create({
      data: { schoolId: f.demo.id, admissionNo: "DEM/2026/0100", firstName: "Third", lastName: "Okafor", dob: new Date("2019-01-01"), gender: "F", classId: f.p2.id },
    });
    // Link under the SAME family phone via a separate guardian row (as enrolment does).
    const g2 = await tx.guardian.create({ data: { schoolId: f.demo.id, name: "Mrs Okafor", phone: "0803-111-2222" } });
    await tx.studentGuardian.create({ data: { schoolId: f.demo.id, studentId: third.id, guardianId: g2.id, relation: "Parent", isPrimary: true } });
    const r = await gen({ termId: f.term.id, classId: f.p2.id });
    assertEqual((await r.json()).created, 1);
    const inv = await tx.invoice.findFirstOrThrow({ where: { studentId: third.id } });
    assertEqual(inv.discountKobo, 60000, "formatted/dashed phone still matches family key");
  });

  await test("students without a fee structure are reported, not billed", async () => {
    const kg = await tx.schoolClass.create({ data: { schoolId: f.demo.id, name: "Nursery 1", level: 0 } });
    await tx.student.create({ data: { schoolId: f.demo.id, admissionNo: "DEM/2026/0101", firstName: "No", lastName: "Fees", dob: new Date("2021-01-01"), gender: "M", classId: kg.id } });
    const r = await gen({ termId: f.term.id });
    const j = await r.json();
    assertEqual(j.created, 0);
    assert(j.classesWithoutFees >= 1, "counted in classesWithoutFees");
    assertEqual(await tx.invoice.count({ where: { termId: f.term.id } }), 7, "invoice count unchanged");
  });

  await test("tenant isolation: generated rows belong to the session's school", async () => {
    const all = await tx.invoice.findMany({ where: { termId: f.term.id } });
    assert(all.every((i) => i.schoolId === f.demo.id));
    assertEqual(await tx.invoice.count({ where: { schoolId: f.other.id } }), 0, "other school untouched");
  });

  summary("invoice generation");
  await truncateAll();
  await tx.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
