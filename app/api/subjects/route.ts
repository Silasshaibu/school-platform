import { z } from "zod";
import { tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";

export const GET = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN", "BURSAR", "TEACHER");
  const db = tenantDb(school!.id);
  const classId = new URL(req.url).searchParams.get("classId");
  const [subjects, links] = await Promise.all([db.subject.findMany({ orderBy: { name: "asc" } }), db.classSubject.findMany()]);
  const out = subjects.map((s) => ({ ...s, classIds: links.filter((l) => l.subjectId === s.id).map((l) => l.classId) }));
  return Response.json(classId ? out.filter((s) => s.classIds.includes(classId)) : out);
});

export const POST = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN");
  const { name } = z.object({ name: z.string().min(2).max(60) }).parse(await req.json());
  return Response.json(await tenantDb(school!.id).subject.create({ data: { name, schoolId: school!.id } }), { status: 201 });
});
