import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
export async function GET() {
  const s = await getSession();
  const u = s && (await prisma.user.findUnique({ where: { id: s.uid }, select: { name: true, role: true } }));
  return u ? Response.json(u) : new Response("Unauthorized", { status: 401 });
}
