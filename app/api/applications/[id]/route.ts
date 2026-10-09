import { z } from "zod";
import { tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";
import { canMove } from "@/lib/admissions";

const body = z.object({
  stage: z.enum(["APPLIED","ASSESSED","OFFERED","ACCEPTED","DECLINED","WAITLISTED"]).optional(),
  assessmentScore: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { school, session } = await requireRole("ADMIN");
  const db = tenantDb(school!.id);
  const data = body.parse(await req.json());
  const app = await db.application.findFirst({ where: { id } });
  if (!app) return new Response("Not found", { status: 404 });
  if (data.stage && !canMove(app.stage, data.stage))
    return Response.json({ error: `Cannot move from ${app.stage} to ${data.stage}` }, { status: 409 });
  const updated = await db.application.update({ where: { id }, data });
  return Response.json(updated);
});
