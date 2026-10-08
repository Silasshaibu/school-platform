import type { tenantDb } from "./db";
import { COMPONENTS } from "./grading";

type DB = ReturnType<typeof tenantDb>;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Totals, averages and positions for everyone in a class (ties share a position). */
export async function classStanding(db: DB, classId: string, termId: string) {
  const [students, links] = await Promise.all([
    db.student.findMany({ where: { classId, status: "ACTIVE" }, select: { id: true, firstName: true, lastName: true, admissionNo: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    db.classSubject.findMany({ where: { classId } }),
  ]);
  const subjectIds = links.map((l) => l.subjectId);
  const scores = await db.score.findMany({ where: { termId, subjectId: { in: subjectIds }, studentId: { in: students.map((s) => s.id) } } });
  const totals = new Map<string, number>();
  for (const s of scores) totals.set(s.studentId, (totals.get(s.studentId) ?? 0) + s.value);
  const n = subjectIds.length;
  const rows = students.map((s) => ({ ...s, hasScores: totals.has(s.id), total: r1(totals.get(s.id) ?? 0), average: n ? r1((totals.get(s.id) ?? 0) / n) : 0 }));
  const ranked = rows.filter((r) => r.hasScores).sort((a, b) => b.total - a.total);
  const pos = new Map<string, number>();
  ranked.forEach((r, i) => pos.set(r.id, i > 0 && r.total === ranked[i - 1].total ? pos.get(ranked[i - 1].id)! : i + 1));
  return { rows: rows.map((r) => ({ ...r, position: pos.get(r.id) ?? null })), subjectCount: n, rankedCount: ranked.length };
}

export async function buildCard(db: DB, studentId: string, termId: string) {
  const student = await db.student.findFirst({ where: { id: studentId }, include: { class: true } });
  const term = await db.term.findFirst({ where: { id: termId }, include: { year: true } });
  if (!student || !term) return null;
  const [standing, links, scores, scale, att, card] = await Promise.all([
    classStanding(db, student.classId, termId),
    db.classSubject.findMany({ where: { classId: student.classId }, include: { subject: true } }),
    db.score.findMany({ where: { studentId, termId } }),
    db.gradeScale.findMany({ orderBy: { minScore: "desc" } }),
    db.attendance.findMany({ where: { studentId, date: { gte: term.startsOn, lte: term.endsOn } } }),
    db.reportCard.findFirst({ where: { studentId, termId } }),
  ]);
  const grade = (t: number) => scale.find((g) => t >= g.minScore) ?? null;
  const subjects = links.map((l) => l.subject).sort((a, b) => a.name.localeCompare(b.name)).map((sub) => {
    const mine = scores.filter((x) => x.subjectId === sub.id);
    const by = Object.fromEntries(mine.map((x) => [x.component, x.value]));
    const total = mine.length ? r1(mine.reduce((t, x) => t + x.value, 0)) : null;
    const g = total === null ? null : grade(total);
    return { name: sub.name, CA1: by.CA1 ?? null, CA2: by.CA2 ?? null, EXAM: by.EXAM ?? null, total, grade: g?.grade ?? null, remark: g?.remark ?? null };
  });
  const me = standing.rows.find((r) => r.id === studentId)!;
  return {
    student: { id: student.id, name: `${student.firstName} ${student.lastName}`, admissionNo: student.admissionNo, className: `${student.class.name} ${student.class.arm}`.trim() },
    term: { name: term.name, year: term.year.name },
    max: COMPONENTS, subjects,
    summary: { total: me.total, average: me.average, position: me.position, outOf: standing.rankedCount },
    attendance: { present: att.filter((a) => a.status === "PRESENT").length, late: att.filter((a) => a.status === "LATE").length, absent: att.filter((a) => a.status === "ABSENT").length },
    teacherRemark: card?.teacherRemark ?? null, headRemark: card?.headRemark ?? null, locked: card?.locked ?? false,
    scale: scale.map((g) => ({ minScore: g.minScore, grade: g.grade, remark: g.remark })),
  };
}
