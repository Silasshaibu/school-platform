import { z } from "zod";
import { tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";

export const GET = route(async (_: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { school } = await requireRole("ADMIN", "BURSAR", "TEACHER");
  const st = await tenantDb(school!.id).student.findFirst({
    where: { id },
    include: { class: true },
  });
  if (!st) return new Response("Not found", { status: 404 });
  const links = await tenantDb(school!.id).studentGuardian.findMany({
    where: { studentId: id }, include: { guardian: true },
  });
  return Response.json({ ...st, guardians: links });
});

const patch = z.object({
  firstName: z.string().min(1), lastName: z.string().min(1), gender: z.enum(["M", "F"]),
  dob: z.coerce.date(), classId: z.string(), status: z.enum(["ACTIVE", "GRADUATED", "WITHDRAWN"]),
  medicalNotes: z.string().max(2000), photoUrl: z.string().url(),
}).partial();

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { school } = await requireRole("ADMIN");
  const data = patch.parse(await req.json());
  const db = tenantDb(school!.id);
  if (!(await db.student.findFirst({ where: { id } }))) return new Response("Not found", { status: 404 });
  return Response.json(await db.student.update({ where: { id }, data }));
});
