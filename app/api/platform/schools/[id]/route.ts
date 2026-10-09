import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { route } from "@/lib/http";

const body = z.object({
  active: z.boolean(), plan: z.enum(["trial", "starter", "standard", "premium"]),
  name: z.string().min(3).max(80), primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
}).partial();

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireSuperAdmin();
  const { id } = await ctx.params;
  const data = body.parse(await req.json());
  const school = await prisma.school.update({ where: { id }, data, select: { id: true, plan: true, active: true } });
  await prisma.auditLog.create({ data: { schoolId: id, userId: s.uid, action: "PLATFORM_UPDATE_SCHOOL", entity: "School", entityId: id } });
  return Response.json(school);
});
