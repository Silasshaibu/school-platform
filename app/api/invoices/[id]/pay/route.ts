import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma, tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";
import { dueKobo, paidKobo } from "@/lib/fees";
import { initialize } from "@/lib/paystack";

const body = z.object({ amountKobo: z.number().int().min(5000).optional() });

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { school, session } = await requireRole("ADMIN", "BURSAR", "PARENT");
  const sid = school!.id;
  const db = tenantDb(sid);
  const { amountKobo } = body.parse(await req.json().catch(() => ({})));

  const inv = await db.invoice.findFirst({ where: { id }, include: { payments: true } });
  if (!inv) return new Response("Not found", { status: 404 });
  if (session.role === "PARENT") {
    const link = await db.studentGuardian.findFirst({ where: { studentId: inv.studentId, guardian: { userId: session.uid } } });
    if (!link) return new Response("Forbidden", { status: 403 });
  }
  const outstanding = dueKobo(inv) - paidKobo(inv.payments);
  if (inv.status === "VOID" || outstanding <= 0) return Response.json({ error: "Nothing to pay" }, { status: 409 });
  const amount = amountKobo ?? outstanding;
  if (amount > outstanding) return Response.json({ error: "Amount exceeds balance", outstandingKobo: outstanding }, { status: 422 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.uid } });
  const reference = `PAY_${randomUUID().replace(/-/g, "")}`;
  const pay = await db.payment.create({ data: { schoolId: sid, invoiceId: id, amountKobo: amount, reference } });
  try {
    const r = await initialize({
      email: user.email, amountKobo: amount, reference,
      callbackUrl: `${new URL(req.url).origin}/pay/complete`, metadata: { invoiceId: id, schoolId: sid },
    });
    return Response.json({ authorizationUrl: r.authorization_url, reference });
  } catch (e) {
    await prisma.payment.update({ where: { id: pay.id }, data: { status: "FAILED" } });
    return Response.json({ error: "Payment provider unavailable, try again" }, { status: 502 });
  }
});
