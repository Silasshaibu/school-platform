import { z } from "zod";
import { tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";

export const GET = route(async () => {
  const { school } = await requireRole("ADMIN", "BURSAR");
  return Response.json(await tenantDb(school!.id).feeItem.findMany({ orderBy: { name: "asc" } }));
});

export const POST = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN", "BURSAR");
  const { name } = z.object({ name: z.string().min(2).max(60) }).parse(await req.json());
  return Response.json(await tenantDb(school!.id).feeItem.create({ data: { name, schoolId: school!.id } }), { status: 201 });
});
