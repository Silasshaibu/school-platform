import { prisma } from "@/lib/db";
import { route } from "@/lib/http";
import { paidKobo, dueKobo, statusFor } from "@/lib/fees";
import { validSignature } from "@/lib/paystack";

// Not tenant-scoped: Paystack calls one URL. The Payment row (unique reference) tells us the school.
export const POST = route(async (req: Request) => {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-paystack-signature"))) return new Response("Bad signature", { status: 401 });
  const evt = JSON.parse(raw);
  if (evt.event !== "charge.success") return new Response("ok");

  const { reference, amount, currency, channel } = evt.data;
  const pay = await prisma.payment.findUnique({ where: { reference } });
  if (!pay || pay.status === "SUCCESS") return new Response("ok"); // unknown or already processed

  if (amount !== pay.amountKobo || currency !== "NGN") {
    await prisma.payment.update({ where: { id: pay.id }, data: { status: "FAILED" } });
    await prisma.auditLog.create({ data: { schoolId: pay.schoolId, action: "PAYMENT_MISMATCH", entity: "Payment", entityId: pay.id } });
    return new Response("ok"); // 200 so Paystack stops retrying; flagged for review
  }

  await prisma.$transaction(async (tx) => {
    // Atomic claim: if a duplicate webhook races us, only one gets count === 1.
    const claim = await tx.payment.updateMany({
      where: { id: pay.id, status: "PENDING" },
      data: { status: "SUCCESS", paidAt: new Date(), method: channel },
    });
    if (claim.count === 0) return;
    const s = await tx.school.update({ where: { id: pay.schoolId }, data: { receiptSeq: { increment: 1 } } });
    await tx.payment.update({
      where: { id: pay.id },
      data: { receiptNo: `RCT/${new Date().getFullYear()}/${String(s.receiptSeq).padStart(5, "0")}` },
    });
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: pay.invoiceId }, include: { payments: true } });
    await tx.invoice.update({ where: { id: inv.id }, data: { status: statusFor(dueKobo(inv), paidKobo(inv.payments)) } });
  });
  return new Response("ok");
});
