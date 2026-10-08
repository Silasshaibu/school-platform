import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, checkPassword, hashPassword } from "@/lib/auth";
import { route } from "@/lib/http";

export const POST = route(async (req: Request) => {
  const s = await getSession();
  if (!s) return new Response("Unauthorized", { status: 401 });
  const { current, next } = z.object({ current: z.string(), next: z.string().min(8).max(100) }).parse(await req.json());
  const u = await prisma.user.findUniqueOrThrow({ where: { id: s.uid } });
  if (!(await checkPassword(current, u.passwordHash))) return Response.json({ error: "Your current password is not right" }, { status: 403 });
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next) } });
  return Response.json({ ok: true });
});
