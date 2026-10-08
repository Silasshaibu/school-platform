import { tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";

export const GET = route(async () => {
  const { school } = await requireRole("ADMIN", "BURSAR", "TEACHER");
  return Response.json(await tenantDb(school!.id).schoolClass.findMany({ orderBy: [{ level: "asc" }, { arm: "asc" }] }));
});
