import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";

export const GET = route(async () => {
  const { school } = await requireRole("ADMIN", "BURSAR");
  return Response.json({ siblingDiscountPercent: school!.siblingDiscountPercent, withholdReportsIfOwing: school!.withholdReportsIfOwing });
});

const body = z.object({ siblingDiscountPercent: z.number().int().min(0).max(100), withholdReportsIfOwing: z.boolean() }).partial();

export const PATCH = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN");
  const data = body.parse(await req.json());
  return Response.json(await prisma.school.update({ where: { id: school!.id }, data, select: { siblingDiscountPercent: true, withholdReportsIfOwing: true } }));
});
