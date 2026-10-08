import { z } from "zod";
import { prisma, tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";
import { nextAdmissionNo } from "@/lib/admission";

const body = z.object({
  gender: z.enum(["M", "F"]),
  arm: z.string().max(10).default(""),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});

// ACCEPTED application -> Student + Guardian + link, in one transaction.
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { school, session } = await requireRole("ADMIN");
  const sid = school!.id;
  const db = tenantDb(sid);
  const input = body.parse(await req.json());

  const app = await db.application.findFirst({ where: { id } });
  if (!app) return new Response("Not found", { status: 404 });
  if (app.stage !== "ACCEPTED")
    return Response.json({ error: "Application must be ACCEPTED before enrolment" }, { status: 409 });
  if (!app.childDob) return Response.json({ error: "Child's date of birth is required" }, { status: 422 });

  const cls = await db.schoolClass.findFirst({ where: { name: app.classWanted, arm: input.arm } });
  if (!cls) return Response.json({ error: `No class named "${app.classWanted}"` }, { status: 422 });

  const parts = app.childName.trim().split(/\s+/);
  const lastName = input.lastName ?? (parts.length > 1 ? parts.pop()! : parts[0]);
  const firstName = input.firstName ?? (parts.join(" ") || lastName);
  const admissionNo = await nextAdmissionNo(sid);

  const student = await db.$transaction(async (tx) => {
    const st = await tx.student.create({
      data: { schoolId: sid, admissionNo, firstName, lastName, dob: app.childDob!, gender: input.gender, classId: cls.id },
    });
    const g = await tx.guardian.create({
      data: { schoolId: sid, name: app.parentName, phone: app.parentPhone, email: app.parentEmail },
    });
    await tx.studentGuardian.create({
      data: { schoolId: sid, studentId: st.id, guardianId: g.id, relation: "Parent", isPrimary: true, canPickup: true },
    });
    await tx.application.update({ where: { id }, data: { stage: "ENROLLED", studentId: st.id } });
    return st;
  });
  await prisma.auditLog.create({
    data: { schoolId: sid, userId: session.uid, action: "ENROLL", entity: "Student", entityId: student.id },
  });
  return Response.json(student, { status: 201 });
});
