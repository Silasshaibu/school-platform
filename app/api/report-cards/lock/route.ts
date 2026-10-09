import { z } from "zod";
import { prisma, tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";

const body = z.object({ termId: z.string(), classId: z.string().optional(), locked: z.boolean() });

// Locking freezes scores and remarks and releases report cards to parents. Unlocking is audited.
export const POST = route(async (req: Request) => {
  const { school, session } = await requireRole("ADMIN");
  const sid = school!.id;
  const { termId, classId, locked } = body.parse(await req.json());
  const db = tenantDb(sid);
  const ids = (await db.student.findMany({ where: { status: "ACTIVE", ...(classId && { classId }) }, select: { id: true } })).map((s) => s.id);
  if (locked) {
    await db.$transaction(ids.map((studentId) => db.reportCard.upsert({
      where: { studentId_termId: { studentId, termId } }, update: { locked: true }, create: { schoolId: sid, studentId, termId, locked: true },
    })));
  } else {
    await db.reportCard.updateMany({ where: { termId, studentId: { in: ids } }, data: { locked: false } });
  }
  await prisma.auditLog.create({ data: { schoolId: sid, userId: session.uid, action: locked ? "LOCK_RESULTS" : "UNLOCK_RESULTS", entity: "Term", entityId: termId } });
  return Response.json({ students: ids.length, locked });
});
