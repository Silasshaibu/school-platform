import { z } from "zod";
import { tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const day = (s: string) => new Date(s + "T00:00:00.000Z");

export const GET = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN", "TEACHER");
  const p = new URL(req.url).searchParams;
  const classId = p.get("classId"), date = p.get("date") ?? "";
  if (!classId || !DATE.test(date)) return Response.json({ error: "classId and date (YYYY-MM-DD) required" }, { status: 400 });
  const db = tenantDb(school!.id);
  const students = await db.student.findMany({
    where: { classId, status: "ACTIVE" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, admissionNo: true },
  });
  const marks = await db.attendance.findMany({ where: { date: day(date), studentId: { in: students.map((s) => s.id) } } });
  const by = new Map(marks.map((m) => [m.studentId, m.status]));
  return Response.json(students.map((s) => ({ ...s, status: by.get(s.id) ?? null })));
});

const body = z.object({
  classId: z.string(), date: z.string().regex(DATE),
  marks: z.array(z.object({ studentId: z.string(), status: z.enum(["PRESENT", "ABSENT", "LATE"]) })).max(200),
});

export const PUT = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN", "TEACHER");
  const sid = school!.id;
  const { classId, date, marks } = body.parse(await req.json());
  if (day(date).getTime() > Date.now() + 24 * 3600 * 1000) return Response.json({ error: "You can't mark attendance for a future date" }, { status: 422 });
  const db = tenantDb(sid);
  const ids = new Set((await db.student.findMany({ where: { classId, status: "ACTIVE" }, select: { id: true } })).map((s) => s.id));
  if (marks.some((m) => !ids.has(m.studentId))) return Response.json({ error: "A student is not in this class" }, { status: 422 });
  await db.$transaction(marks.map((m) => db.attendance.upsert({
    where: { studentId_date: { studentId: m.studentId, date: day(date) } },
    update: { status: m.status },
    create: { schoolId: sid, studentId: m.studentId, date: day(date), status: m.status },
  })));
  return Response.json({ saved: marks.length });
});
