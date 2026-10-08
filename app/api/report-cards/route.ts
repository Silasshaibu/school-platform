import { z } from "zod";
import { tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";
import { classStanding } from "@/lib/report";

export const GET = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN", "TEACHER");
  const p = new URL(req.url).searchParams;
  const classId = p.get("classId"), termId = p.get("termId");
  if (!classId || !termId) return Response.json({ error: "classId and termId required" }, { status: 400 });
  const db = tenantDb(school!.id);
  const st = await classStanding(db, classId, termId);
  const cards = await db.reportCard.findMany({ where: { termId, studentId: { in: st.rows.map((r) => r.id) } } });
  const by = new Map(cards.map((c) => [c.studentId, c]));
  return Response.json(st.rows.map((r) => ({ ...r, teacherRemark: by.get(r.id)?.teacherRemark ?? "", headRemark: by.get(r.id)?.headRemark ?? "", locked: by.get(r.id)?.locked ?? false })));
});

const body = z.object({ termId: z.string(), studentId: z.string(), teacherRemark: z.string().max(300).optional(), headRemark: z.string().max(300).optional() });

export const PUT = route(async (req: Request) => {
  const { school, session } = await requireRole("ADMIN", "TEACHER");
  const sid = school!.id;
  const d = body.parse(await req.json());
  if (d.headRemark !== undefined && session.role !== "ADMIN") return Response.json({ error: "Only an admin can write the head's remark" }, { status: 403 });
  const db = tenantDb(sid);
  if (!(await db.student.findFirst({ where: { id: d.studentId } }))) return new Response("Not found", { status: 404 });
  const existing = await db.reportCard.findFirst({ where: { studentId: d.studentId, termId: d.termId } });
  if (existing?.locked) return Response.json({ error: "Results for this term are locked" }, { status: 423 });
  const data = { ...(d.teacherRemark !== undefined && { teacherRemark: d.teacherRemark }), ...(d.headRemark !== undefined && { headRemark: d.headRemark }) };
  await db.reportCard.upsert({
    where: { studentId_termId: { studentId: d.studentId, termId: d.termId } },
    update: data, create: { schoolId: sid, studentId: d.studentId, termId: d.termId, ...data },
  });
  return Response.json({ ok: true });
});
