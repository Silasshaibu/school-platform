import { z } from "zod";
import { tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";

const body = z.object({
  name: z.string().min(2), phone: z.string().min(7), email: z.string().email().optional(),
  relation: z.string().min(2), canPickup: z.boolean().default(false), isPrimary: z.boolean().default(false),
});

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { school } = await requireRole("ADMIN");
  const sid = school!.id;
  const db = tenantDb(sid);
  if (!(await db.student.findFirst({ where: { id } }))) return new Response("Not found", { status: 404 });
  const { relation, canPickup, isPrimary, ...g } = body.parse(await req.json());
  const link = await db.$transaction(async (tx) => {
    const guardian = await tx.guardian.create({ data: { ...g, schoolId: sid } });
    return tx.studentGuardian.create({
      data: { schoolId: sid, studentId: id, guardianId: guardian.id, relation, canPickup, isPrimary },
    });
  });
  return Response.json(link, { status: 201 });
});
