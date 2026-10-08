/**
 * Report cards: class standings with tie handling, grade boundaries, and the
 * pure logic in lib/grading.ts / lib/report.ts.
 */
import { tx, test, assert, assertEqual, rebuildSchema, summary, truncateAll, TEST_URL } from "./harness";
import { make } from "./fixtures";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  rebuildSchema(process.env.DATABASE_URL, TEST_URL!);

  const f = await make();
  const { tenantDb } = await import("@/lib/db");
  const { classStanding, buildCard } = await import("@/lib/report");
  const { gradeFor, COMPONENTS } = await import("@/lib/grading");
  const db = tenantDb(f.demo.id);

  // Scores for P1 (subjects: English + Maths; components CA1/20, CA2/20, EXAM/60)
  // Ada:   90 total (45+45 across both subjects: 20/20,20/20... let's set explicitly)
  const put = (studentId: string, subjectId: string, component: string, value: number) =>
    tx.score.create({ data: { schoolId: f.demo.id, studentId, subjectId, termId: f.term.id, component, value } });

  await put(f.ada.id, f.eng.id, "CA1", 20); await put(f.ada.id, f.eng.id, "CA2", 20); await put(f.ada.id, f.eng.id, "EXAM", 60); // 100
  await put(f.ada.id, f.maths.id, "CA1", 18); await put(f.ada.id, f.maths.id, "CA2", 18); await put(f.ada.id, f.maths.id, "EXAM", 54); // 90
  await put(f.ben.id, f.eng.id, "CA1", 10); await put(f.ben.id, f.eng.id, "CA2", 10); await put(f.ben.id, f.eng.id, "EXAM", 30); // 50
  await put(f.ben.id, f.maths.id, "CA1", 10); await put(f.ben.id, f.maths.id, "CA2", 10); await put(f.ben.id, f.maths.id, "EXAM", 30); // 50
  await put(f.cal.id, f.eng.id, "CA1", 15); await put(f.cal.id, f.eng.id, "CA2", 15); await put(f.cal.id, f.eng.id, "EXAM", 45); // 75
  await put(f.cal.id, f.maths.id, "CA1", 12); await put(f.cal.id, f.maths.id, "CA2", 12); await put(f.cal.id, f.maths.id, "EXAM", 36); // 60
  // Dana deliberately has NO scores.

  await test("component weights sum to 100", () => {
    assertEqual(COMPONENTS.CA1 + COMPONENTS.CA2 + COMPONENTS.EXAM, 100);
  });

  await test("gradeFor picks the highest band reached", async () => {
    const scale = await tx.gradeScale.findMany({ where: { schoolId: f.demo.id } });
    assertEqual(gradeFor(100, scale)?.grade, "A");
    assertEqual(gradeFor(70, scale)?.grade, "A", "boundary inclusive");
    assertEqual(gradeFor(69.9, scale)?.grade, "B");
    assertEqual(gradeFor(40, scale)?.grade, "D");
    assertEqual(gradeFor(0, scale)?.grade, "E");
    assertEqual(gradeFor(-1, scale), null);
  });

  await test("class standing ranks by total with ties sharing a position", async () => {
    const st = await classStanding(db, f.p1.id, f.term.id);
    const pos = Object.fromEntries(st.rows.map((r) => [r.lastName, r.position]));
    assertEqual(pos.Okafor, 1, "Ada 190 -> 1st");
    assertEqual(pos.Uche, 2, "Cal 135 -> 2nd");
    assertEqual(pos.Eze, 3, "Ben 100 -> 3rd");
    assertEqual(pos.Ali, null, "Dana unscored -> no position");
    assertEqual(st.rankedCount, 3);
    assertEqual(st.subjectCount, 2);
    const ada = st.rows.find((r) => r.lastName === "Okafor")!;
    assertEqual(ada.total, 190);
    assertEqual(ada.average, 95, "average over 2 subjects");
  });

  await test("tie shares the higher position and next rank skips", async () => {
    // Give Cal the same totals as Ada (190) to force a tie for first.
    await tx.score.deleteMany({ where: { studentId: f.cal.id } });
    await put(f.cal.id, f.eng.id, "CA1", 20); await put(f.cal.id, f.eng.id, "CA2", 20); await put(f.cal.id, f.eng.id, "EXAM", 60);
    await put(f.cal.id, f.maths.id, "CA1", 18); await put(f.cal.id, f.maths.id, "CA2", 18); await put(f.cal.id, f.maths.id, "EXAM", 54);
    const st = await classStanding(db, f.p1.id, f.term.id);
    const p = (ln: string) => st.rows.find((r) => r.lastName === ln)!.position;
    assertEqual(p("Okafor"), 1);
    assertEqual(p("Uche"), 1, "tie shares first");
    assertEqual(p("Eze"), 3, "next position skips 2");
  });

  await test("buildCard assembles per-subject rows, grades, attendance, remarks", async () => {
    await tx.attendance.createMany({ data: [
      { schoolId: f.demo.id, studentId: f.ada.id, date: new Date("2026-09-15"), status: "PRESENT" },
      { schoolId: f.demo.id, studentId: f.ada.id, date: new Date("2026-09-16"), status: "LATE" },
      { schoolId: f.demo.id, studentId: f.ada.id, date: new Date("2026-09-17"), status: "ABSENT" },
      { schoolId: f.demo.id, studentId: f.ada.id, date: new Date("2025-01-01"), status: "ABSENT" }, // outside term window
    ] });
    await tx.reportCard.create({ data: { schoolId: f.demo.id, studentId: f.ada.id, termId: f.term.id, teacherRemark: "Great work", locked: true } });
    const card = await buildCard(db, f.ada.id, f.term.id);
    assert(card !== null);
    assertEqual(card!.student.admissionNo, "DEM/2026/0001");
    assertEqual(card!.term.name, "First Term");
    assertEqual(card!.subjects.length, 2);
    const eng = card!.subjects.find((s) => s.name === "English Studies")!;
    assertEqual(eng.CA1, 20); assertEqual(eng.total, 100); assertEqual(eng.grade, "A");
    assertEqual(eng.remark, "Excellent");
    const maths = card!.subjects.find((s) => s.name === "Mathematics")!;
    assertEqual(maths.total, 90); assertEqual(maths.grade, "A");
    assertEqual(card!.summary.position, 1);
    assertEqual(card!.summary.outOf, 3);
    assertEqual(card!.attendance, { present: 1, late: 1, absent: 1 }, "only dates inside the term count");
    assertEqual(card!.teacherRemark, "Great work");
    assertEqual(card!.locked, true);
  });

  await test("subject with no scores shows nulls, not zeros", async () => {
    const extra = await tx.subject.create({ data: { schoolId: f.demo.id, name: "Coding" } });
    await tx.classSubject.create({ data: { schoolId: f.demo.id, classId: f.p1.id, subjectId: extra.id } });
    const card = await buildCard(db, f.ada.id, f.term.id);
    const c = card!.subjects.find((s) => s.name === "Coding")!;
    assertEqual(c.total, null);
    assertEqual(c.grade, null);
  });

  await test("cross-tenant ids are invisible to buildCard", async () => {
    const card = await buildCard(db, f.eve.id, f.term.id); // eve belongs to school "other"
    assertEqual(card, null, "scoped client cannot see another school's student");
  });

  summary("report cards & grading");
  await truncateAll();
  await tx.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
