import { z } from "zod";
import { tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";

const body = z.object({ name: z.string().min(2), phone: z.string().min(7).max(20), email: z.string().email(), address: z.string().max(300) }).partial();

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { school } = await requireRole("ADMIN");
  const db = tenantDb(school!.id);
  if (!(await db.guardian.findFirst({ where: { id } }))) return new Response("Not found", { status: 404 });
  const data = body.parse(await req.json());
  if (data.email) data.email = data.email.toLowerCase();
  return Response.json(await db.guardian.update({ where: { id }, data }));
});
