import type { Invoice, Payment } from "@prisma/client";

export const dueKobo = (i: Pick<Invoice, "totalKobo" | "discountKobo">) => i.totalKobo - i.discountKobo;
export const paidKobo = (ps: Pick<Payment, "status" | "amountKobo">[]) =>
  ps.filter((p) => p.status === "SUCCESS").reduce((s, p) => s + p.amountKobo, 0);
export const statusFor = (due: number, paid: number) =>
  paid <= 0 ? "UNPAID" : paid >= due ? "PAID" : ("PART_PAID" as const);
export const withBalance = <T extends Invoice & { payments: Payment[] }>(i: T) => {
  const due = dueKobo(i), paid = paidKobo(i.payments);
  return { ...i, dueKobo: due, paidKobo: paid, balanceKobo: Math.max(0, due - paid) };
};
export const familyKey = (phone: string) => phone.replace(/\D/g, "").slice(-10);
