import { z } from "zod";
import { prisma, tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";
import { COMPONENTS } from "@/lib/grading";

async function check(db: ReturnType<typeof tenantDb>, classId: string, subjectId: string) {
  return !!(await db.classSubject.findFirst({ where: { classId, subjectId } }));
}

export const GET = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN", "TEACHER");
  const p = new URL(req.url).searchParams;
  const classId = p.get("classId"), subjectId = p.get("subjectId"), termId = p.get("termId");
  if (!classId || !subjectId || !termId) return Response.json({ error: "classId, subjectId and termId required" }, { status: 400 });
  const db = tenantDb(school!.id);
  if (!(await check(db, classId, subjectId))) return Response.json({ error: "This class does not take that subject" }, { status: 422 });
  const students = await db.student.findMany({
    where: { classId, status: "ACTIVE" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
  });
  const ids = students.map((s) => s.id);
  const [scores, cards] = await Promise.all([
    db.score.findMany({ where: { subjectId, termId, studentId: { in: ids } } }),
    db.reportCard.findMany({ where: { termId, locked: true, studentId: { in: ids } }, select: { studentId: true } }),
  ]);
  const locked = new Set(cards.map((c) => c.studentId));
  return Response.json({
    max: COMPONENTS,
    students: students.map((s) => ({
      ...s, locked: locked.has(s.id),
      scores: Object.fromEntries(scores.filter((x) => x.studentId === s.id).map((x) => [x.component, x.value])),
    })),
  });
});

const num = z.number().min(0).nullable().optional();
const body = z.object({
  classId: z.string(), subjectId: z.string(), termId: z.string(),
  rows: z.array(z.object({ studentId: z.string(), CA1: num, CA2: num, EXAM: num })).max(200),
});

export const PUT = route(async (req: Request) => {
  const { school, session } = await requireRole("ADMIN", "TEACHER");
  const sid = school!.id;
  const { classId, subjectId, termId, rows } = body.parse(await req.json());
  const db = tenantDb(sid);
  if (!(await check(db, classId, subjectId))) return Response.json({ error: "This class does not take that subject" }, { status: 422 });
  const ids = rows.map((r) => r.studentId);
  const valid = await db.student.count({ where: { id: { in: ids }, classId } });
  if (valid !== new Set(ids).size) return Response.json({ error: "A student is not in this class" }, { status: 422 });
  if (await db.reportCard.count({ where: { termId, locked: true, studentId: { in: ids } } }))
    return Response.json({ error: "Results for this term are locked. Ask an admin to unlock them." }, { status: 423 });

  const ops: any[] = [];
  for (const r of rows) for (const c of Object.keys(COMPONENTS) as (keyof typeof COMPONENTS)[]) {
    const v = r[c];
    if (v === undefined) continue;
    if (v === null) { ops.push(db.score.deleteMany({ where: { studentId: r.studentId, subjectId, termId, component: c } })); continue; }
    if (v > COMPONENTS[c]) return Response.json({ error: `${c} can't be more than ${COMPONENTS[c]}` }, { status: 422 });
    ops.push(db.score.upsert({
      where: { studentId_subjectId_termId_component: { studentId: r.studentId, subjectId, termId, component: c } },
      update: { value: v }, create: { schoolId: sid, studentId: r.studentId, subjectId, termId, component: c, value: v },
    }));
  }
  await db.$transaction(ops);
  await prisma.auditLog.create({ data: { schoolId: sid, userId: session.uid, action: "SAVE_SCORES", entity: "Subject", entityId: subjectId } });
  return Response.json({ saved: rows.length });
});
