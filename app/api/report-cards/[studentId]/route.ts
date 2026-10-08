import { tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";
import { buildCard } from "@/lib/report";
import { dueKobo, paidKobo } from "@/lib/fees";

export const GET = route(async (req: Request, ctx: { params: Promise<{ studentId: string }> }) => {
  const { studentId } = await ctx.params;
  const termId = new URL(req.url).searchParams.get("termId");
  if (!termId) return Response.json({ error: "termId required" }, { status: 400 });
  const { school, session } = await requireRole("ADMIN", "TEACHER", "BURSAR", "PARENT");
  const db = tenantDb(school!.id);

  if (session.role === "PARENT") {
    const link = await db.studentGuardian.findFirst({ where: { studentId, guardian: { userId: session.uid } } });
    if (!link) return new Response("Forbidden", { status: 403 });
  }
  const card = await buildCard(db, studentId, termId);
  if (!card) return new Response("Not found", { status: 404 });

  if (session.role === "PARENT") {
    if (!card.locked) return Response.json({ error: "This term's results haven't been released yet." }, { status: 409 });
    if (school!.withholdReportsIfOwing) {
      const inv = await db.invoice.findFirst({ where: { studentId, termId }, include: { payments: true } });
      const owing = inv ? dueKobo(inv) - paidKobo(inv.payments) : 0;
      if (owing > 0) return Response.json({ error: "The report card is available once the term's fees are paid.", balanceKobo: owing }, { status: 402 });
    }
  }
  return Response.json({ ...card, school: { name: school!.name, logoUrl: school!.logoUrl } });
});
