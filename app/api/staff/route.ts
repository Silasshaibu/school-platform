import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, hashPassword } from "@/lib/auth";
import { route } from "@/lib/http";

export const GET = route(async () => {
  const { school } = await requireRole("ADMIN");
  return Response.json(await prisma.user.findMany({
    where: { schoolId: school!.id, role: { in: ["ADMIN", "BURSAR", "TEACHER"] } },
    select: { id: true, name: true, email: true, role: true, active: true }, orderBy: { name: "asc" },
  }));
});

const body = z.object({ name: z.string().min(2), email: z.string().email(), role: z.enum(["TEACHER", "BURSAR"]), password: z.string().min(8).max(100) });

export const POST = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN");
  const d = body.parse(await req.json());
  const email = d.email.toLowerCase();
  if (await prisma.user.findFirst({ where: { schoolId: school!.id, email } })) return Response.json({ error: "That email already has an account" }, { status: 409 });
  const u = await prisma.user.create({ data: { schoolId: school!.id, email, name: d.name, role: d.role, passwordHash: await hashPassword(d.password) }, select: { id: true } });
  return Response.json(u, { status: 201 });
});
