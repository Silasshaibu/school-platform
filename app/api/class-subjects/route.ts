import { z } from "zod";
import { tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";

// Replace the set of subjects a class takes.
export const PUT = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN");
  const sid = school!.id;
  const { classId, subjectIds } = z.object({ classId: z.string(), subjectIds: z.array(z.string()) }).parse(await req.json());
  const db = tenantDb(sid);
  const ok = (await db.schoolClass.findFirst({ where: { id: classId } })) && (await db.subject.count({ where: { id: { in: subjectIds } } })) === subjectIds.length;
  if (!ok) return Response.json({ error: "Unknown class or subject" }, { status: 422 });
  await db.$transaction([
    db.classSubject.deleteMany({ where: { classId } }),
    db.classSubject.createMany({ data: subjectIds.map((subjectId) => ({ schoolId: sid, classId, subjectId })) }),
  ]);
  return Response.json({ ok: true });
});
