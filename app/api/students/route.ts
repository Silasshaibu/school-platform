import { z } from "zod";
import { tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";
import { nextAdmissionNo } from "@/lib/admission";

export const GET = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN", "BURSAR", "TEACHER");
  const p = new URL(req.url).searchParams;
  const q = p.get("q")?.trim();
  const page = Math.max(1, Number(p.get("page") ?? 1));
  const students = await tenantDb(school!.id).student.findMany({
    where: {
      status: (p.get("status") as any) ?? "ACTIVE",
      ...(p.get("classId") && { classId: p.get("classId")! }),
      ...(q && { OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { admissionNo: { contains: q, mode: "insensitive" } },
      ] }),
    },
    include: { class: { select: { name: true, arm: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 50, skip: (page - 1) * 50,
  });
  return Response.json(students);
});

const create = z.object({
  firstName: z.string().min(1), lastName: z.string().min(1),
  dob: z.coerce.date(), gender: z.enum(["M", "F"]), classId: z.string(),
  medicalNotes: z.string().max(2000).optional(),
});

// Direct admission (walk-ins, transfers) that skips the application pipeline.
export const POST = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN");
  const data = create.parse(await req.json());
  const db = tenantDb(school!.id);
  if (!(await db.schoolClass.findFirst({ where: { id: data.classId } })))
    return Response.json({ error: "Unknown class" }, { status: 422 });
  const admissionNo = await nextAdmissionNo(school!.id);
  const st = await db.student.create({ data: { ...data, schoolId: school!.id, admissionNo } });
  return Response.json(st, { status: 201 });
});
