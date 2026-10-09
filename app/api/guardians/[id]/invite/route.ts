import { randomBytes, createHash } from "crypto";
import { prisma, tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";

// Admin generates a one-time link and shares it (WhatsApp/SMS/email). Valid 7 days.
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { school } = await requireRole("ADMIN");
  const sid = school!.id;
  const db = tenantDb(sid);
  const g = await db.guardian.findFirst({ where: { id } });
  if (!g) return new Response("Not found", { status: 404 });
  if (!g.email) return Response.json({ error: "Add the guardian's email address first" }, { status: 422 });
  if (g.userId) return Response.json({ error: "This guardian already has an account" }, { status: 409 });
  const taken = await prisma.user.findFirst({ where: { schoolId: sid, email: g.email.toLowerCase() } });
  if (taken) return Response.json({ error: "That email already has an account" }, { status: 409 });

  await db.inviteToken.updateMany({ where: { guardianId: g.id, usedAt: null }, data: { usedAt: new Date() } }); // retire old links
  const token = randomBytes(32).toString("hex");
  await db.inviteToken.create({
    data: {
      schoolId: sid, guardianId: g.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });
  return Response.json({ link: `${new URL(req.url).origin}/accept-invite?token=${token}`, expiresInDays: 7 });
});
