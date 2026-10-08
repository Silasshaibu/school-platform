/**
 * Direct student admission: POST /api/students (the "Add student" screen's API).
 * Covers validation, unknown-class rejection, admission numbering, and tenancy.
 */
import { tx, test, assert, assertEqual, rebuildSchema, summary, truncateAll, TEST_URL, setSchoolSlug } from "./harness";
import { make } from "./fixtures";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  rebuildSchema(process.env.DATABASE_URL, TEST_URL!);

  const f = await make();
  const mod = await import("@/app/api/students/route");
  const { createSession } = await import("@/lib/auth");
  setSchoolSlug("demo");

  const req = (body: unknown) =>
    new Request("http://demo.localhost:3000/api/students", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }) as any;
  const good = { firstName: "Tolu", lastName: "Ade", dob: "2019-04-04", gender: "F", classId: f.p1.id };

  await test("anonymous request is rejected with 401", async () => {
    const r = await mod.POST(req(good));
    assertEqual(r.status, 401);
  });

  await test("teacher role is rejected with 403 (admin only)", async () => {
    await createSession({ uid: f.teacher.id, role: "TEACHER", schoolId: f.demo.id });
    const r = await mod.POST(req(good));
    assertEqual(r.status, 403);
  });

  await test("admin creates the student with a generated admission number", async () => {
    await createSession({ uid: f.admin.id, role: "ADMIN", schoolId: f.demo.id });
    const r = await mod.POST(req(good));
    assertEqual(r.status, 201);
    const st = await r.json();
    assert(/^DEM\/\d{4}\/\d{4}$/.test(st.admissionNo), `admission no format: ${st.admissionNo}`);
    assertEqual(st.schoolId, f.demo.id, "row stamped with tenant id");
    const raw = await tx.student.findUniqueOrThrow({ where: { id: st.id } });
    assertEqual(raw.firstName, "Tolu");
    // dob arrives as an ISO date string; z.coerce.date() should store a real date
    assertEqual(new Date(raw.dob).getUTCFullYear(), 2019);
  });

  await test("unknown class is rejected with 422", async () => {
    await createSession({ uid: f.admin.id, role: "ADMIN", schoolId: f.demo.id });
    const r = await mod.POST(req({ ...good, classId: "no-such-class" }));
    assertEqual(r.status, 422);
    assertEqual(await tx.student.count({ where: { firstName: "Ghost" } }), 0);
  });

  await test("another school's class id is rejected (tenant-scoped lookup)", async () => {
    await createSession({ uid: f.admin.id, role: "ADMIN", schoolId: f.demo.id });
    const r = await mod.POST(req({ ...good, classId: f.otherClass.id }));
    assertEqual(r.status, 422, "scoped findFirst cannot see other school's class");
  });

  await test("invalid payload fails zod validation with 400", async () => {
    await createSession({ uid: f.admin.id, role: "ADMIN", schoolId: f.demo.id });
    const r = await mod.POST(req({ ...good, gender: "X" }));
    assertEqual(r.status, 400);
    const j = await r.json();
    assert(Array.isArray(j.issues), "validation issues returned");
  });

  await test("GET lists only the caller's school, filters by class and search", async () => {
    await createSession({ uid: f.admin.id, role: "ADMIN", schoolId: f.demo.id });
    const all = await (await mod.GET(new Request("http://demo.localhost:3000/api/students") as any)).json();
    assert(all.every((s: any) => s.schoolId === f.demo.id), "no cross-tenant rows");
    assert(!all.some((s: any) => s.lastName === "James"), "other school's Eve not visible");

    const p2only = await (await mod.GET(new Request("http://demo.localhost:3000/api/students?classId=" + f.p2.id) as any)).json();
    assert(p2only.length >= 1 && p2only.every((s: any) => s.classId === f.p2.id));

    const found = await (await mod.GET(new Request("http://demo.localhost:3000/api/students?q=okafor") as any)).json();
    assert(found.length >= 2, "search matches both Okafor siblings");
  });

  summary("students API");
  await truncateAll();
  await tx.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
