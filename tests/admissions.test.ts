/**
 * Admissions stage machine (lib/admissions.ts) plus the PATCH endpoint and the
 * enrolment transaction (ACCEPTED -> Student + Guardian + link).
 */
import { tx, test, assert, assertEqual, rebuildSchema, summary, truncateAll, TEST_URL, setSchoolSlug } from "./harness";
import { make } from "./fixtures";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  rebuildSchema(process.env.DATABASE_URL, TEST_URL!);

  const f = await make();
  const { canMove, TRANSITIONS } = await import("@/lib/admissions");
  const { PATCH } = await import("@/app/api/applications/[id]/route");
  const { POST: ENROLL } = await import("@/app/api/applications/[id]/enroll/route");
  const { createSession } = await import("@/lib/auth");
  await createSession({ uid: f.admin.id, role: "ADMIN", schoolId: f.demo.id });
  setSchoolSlug("demo");

  const patch = (id: string, body: object) =>
    PATCH(new Request(`http://demo.localhost:3000/api/applications/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }) as any, { params: Promise.resolve({ id }) });

  await test("happy path transitions are legal", () => {
    for (const [from, to] of [
      ["ENQUIRY", "APPLIED"], ["APPLIED", "ASSESSED"], ["ASSESSED", "OFFERED"],
      ["OFFERED", "ACCEPTED"], ["WAITLISTED", "OFFERED"],
    ] as const)
      assert(canMove(from, to), `${from} -> ${to}`);
  });

  await test("illegal jumps are rejected", () => {
    assert(!canMove("ENQUIRY", "OFFERED"));
    assert(!canMove("DECLINED", "APPLIED"), "declined is terminal");
    assert(!canMove("ENROLLED", "DECLINED"), "enrolled is terminal");
    assert(!canMove("ACCEPTED", "ENROLLED"), "ENROLLED only via enroll endpoint");
    assertEqual(TRANSITIONS.DECLINED, []);
    assertEqual(TRANSITIONS.ENROLLED, []);
  });

  await test("PATCH rejects an illegal stage with 409", async () => {
    const r = await patch(f.app.id, { stage: "ASSESSED" }); // currently ACCEPTED
    assertEqual(r.status, 409);
    assertEqual((await tx.application.findUniqueOrThrow({ where: { id: f.app.id } })).stage, "ACCEPTED");
  });

  await test("PATCH allows a legal stage and stores notes", async () => {
    const r = await patch(f.app.id, { stage: "DECLINED", notes: "family moved away" });
    assertEqual(r.status, 200);
    const app = await tx.application.findUniqueOrThrow({ where: { id: f.app.id } });
    assertEqual(app.stage, "DECLINED");
    assertEqual(app.notes, "family moved away");
  });

  await test("PATCH on another tenant's application returns 404", async () => {
    const foreign = await tx.application.create({
      data: { schoolId: f.other.id, childName: "Foreign Kid", classWanted: "P1", parentName: "P", parentPhone: "08000000000", stage: "ENQUIRY" },
    });
    const r = await patch(foreign.id, { stage: "APPLIED" });
    assertEqual(r.status, 404);
  });

  await test("enrol creates student, guardian, link; flips stage; assigns admission no", async () => {
    const app2 = await tx.application.create({
      data: { schoolId: f.demo.id, childName: "Chidera Obi", classWanted: "Primary 1", parentName: "Mrs Obi", parentPhone: "08055556666", parentEmail: "obi@example.test", stage: "ACCEPTED", childDob: new Date("2019-03-03") },
    });
    const seqBefore = await tx.school.findUniqueOrThrow({ where: { id: f.demo.id } });
    const r = await ENROLL(new Request(`http://demo.localhost:3000/api/applications/${app2.id}/enroll`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gender: "F" }),
    }) as any, { params: Promise.resolve({ id: app2.id }) });
    assertEqual(r.status, 201);
    const student = await r.json();
    assertEqual(student.firstName, "Chidera");
    assertEqual(student.lastName, "Obi");
    assertEqual(student.classId, f.p1.id);
    assertEqual(student.admissionNo, `DEM/${new Date().getFullYear()}/${String(seqBefore.admissionSeq + 1).padStart(4, "0")}`);

    const appRow = await tx.application.findUniqueOrThrow({ where: { id: app2.id } });
    assertEqual(appRow.stage, "ENROLLED");
    assertEqual(appRow.studentId, student.id);

    const link = await tx.studentGuardian.findFirstOrThrow({ where: { studentId: student.id }, include: { guardian: true } });
    assertEqual(link.isPrimary, true);
    assertEqual(link.guardian.phone, "08055556666");
    assertEqual(link.guardian.email, "obi@example.test");

    const audit = await tx.auditLog.findFirst({ where: { entityId: student.id, action: "ENROLL" } });
    assert(audit !== null, "audit row written");
  });

  await test("enrol refuses a non-ACCEPTED application with 409", async () => {
    const r = await ENROLL(new Request(`http://x/api/applications/${f.app.id}/enroll`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gender: "M" }),
    }) as any, { params: Promise.resolve({ id: f.app.id }) });
    assertEqual(r.status, 409); // f.app was DECLINED above
  });

  await test("enrol without dob fails with 422", async () => {
    const app3 = await tx.application.create({
      data: { schoolId: f.demo.id, childName: "No Dob", classWanted: "Primary 1", parentName: "P", parentPhone: "08000000001", stage: "ACCEPTED" },
    });
    const r = await ENROLL(new Request("http://x/api/applications/a/enroll", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gender: "M" }),
    }) as any, { params: Promise.resolve({ id: app3.id }) });
    assertEqual(r.status, 422);
  });

  await test("admission numbers increment atomically per school", async () => {
    const mkApp = () => tx.application.create({
      data: { schoolId: f.demo.id, childName: "Kid Extra", classWanted: "Primary 2", parentName: "P", parentPhone: "08000000002", stage: "ACCEPTED", childDob: new Date("2019-01-01") },
    });
    const apps = await Promise.all([mkApp(), mkApp()]);
    const results = await Promise.all(apps.map((a) =>
      ENROLL(new Request("http://x/api/applications/a/enroll", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gender: "M" }),
      }) as any, { params: Promise.resolve({ id: a.id }) }).then((r) => r.json())));
    const nos = results.map((s) => s.admissionNo);
    assertEqual(new Set(nos).size, 2, `no collisions: ${nos.join(", ")}`);
  });

  summary("admissions pipeline");
  await truncateAll();
  await tx.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
