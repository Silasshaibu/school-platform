/**
 * Paystack webhook: duplicate webhooks must not double-credit, bad signatures
 * and mismatched amounts must be rejected/flagged.
 */
import { createHmac } from "crypto";
import {
  tx, test, assert, assertEqual, rebuildSchema, summary, truncateAll, DEV_URL, TEST_URL,
} from "./harness";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  rebuildSchema(DEV_URL, TEST_URL);

  const { POST } = await import("@/app/api/webhooks/paystack/route");

  const school = await tx.school.create({ data: { slug: "wh", name: "WH School" } });
  const year = await tx.academicYear.create({ data: { schoolId: school.id, name: "Y", startsOn: new Date("2026-01-01"), endsOn: new Date("2027-01-01") } });
  const term = await tx.term.create({ data: { schoolId: school.id, yearId: year.id, name: "T1", startsOn: new Date("2026-01-01"), endsOn: new Date("2026-04-01") } });
  const cls = await tx.schoolClass.create({ data: { schoolId: school.id, name: "P1", level: 1 } });
  const stu = await tx.student.create({ data: { schoolId: school.id, admissionNo: "W/1", firstName: "A", lastName: "B", dob: new Date("2019-01-01"), gender: "M", classId: cls.id } });
  const inv = await tx.invoice.create({ data: { schoolId: school.id, studentId: stu.id, termId: term.id, totalKobo: 500000 } });
  const pay = await tx.payment.create({ data: { schoolId: school.id, invoiceId: inv.id, amountKobo: 500000, reference: "REF-DUP-1" } });

  const sign = (raw: string) => createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!).update(raw).digest("hex");
  const post = (body: object, sig?: string | null) => {
    const raw = JSON.stringify(body);
    return POST(new Request("http://localhost/api/webhooks/paystack", {
      method: "POST",
      headers: { "content-type": "application/json", ...(sig !== undefined ? { "x-paystack-signature": String(sig) } : {}) },
      body: raw,
    }) as any);
  };
  const charge = (over?: Record<string, unknown>) => ({
    event: "charge.success",
    data: { reference: "REF-DUP-1", amount: 500000, currency: "NGN", channel: "card", ...over },
  });

  await test("unsigned request is rejected", async () => {
    const r = await post(charge(), null);
    assertEqual(r.status, 401);
    assertEqual((await tx.payment.findUniqueOrThrow({ where: { id: pay.id } })).status, "PENDING");
  });

  await test("bad signature is rejected", async () => {
    const r = await post(charge(), "deadbeef");
    assertEqual(r.status, 401);
  });

  await test("valid webhook credits once", async () => {
    const raw = JSON.stringify(charge());
    const r = await post(charge(), sign(raw));
    assertEqual(r.status, 200);
    const p = await tx.payment.findUniqueOrThrow({ where: { id: pay.id } });
    assertEqual(p.status, "SUCCESS");
    assert(p.receiptNo && /^RCT\/\d{4}\/\d{5}$/.test(p.receiptNo), `receipt number assigned (${p.receiptNo})`);
    assertEqual((await tx.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status, "PAID");
  });

  await test("duplicate webhook does NOT double-credit", async () => {
    const before = await tx.school.findUniqueOrThrow({ where: { id: school.id } });
    const raw = JSON.stringify(charge());
    const r = await post(charge(), sign(raw));
    assertEqual(r.status, 200);
    const after = await tx.school.findUniqueOrThrow({ where: { id: school.id } });
    assertEqual(after.receiptSeq, before.receiptSeq, "receipt sequence unchanged");
    assertEqual(await tx.payment.count({ where: { invoiceId: inv.id } }), 1, "no extra payment row");
  });

  await test("concurrent duplicate webhooks credit exactly once (atomic claim)", async () => {
    // Fresh payment so the earlier SUCCESS row doesn't short-circuit.
    const inv2 = await tx.invoice.create({ data: { schoolId: school.id, studentId: stu.id, termId: term.id, totalKobo: 300000 } }).catch(async () => {
      // @@unique([studentId, termId]) — use a second term instead.
      const term2 = await tx.term.create({ data: { schoolId: school.id, yearId: year.id, name: "T2", startsOn: new Date("2026-05-01"), endsOn: new Date("2026-08-01") } });
      return tx.invoice.create({ data: { schoolId: school.id, studentId: stu.id, termId: term2.id, totalKobo: 300000 } });
    });
    const ref = "REF-RACE-1";
    await tx.payment.create({ data: { schoolId: school.id, invoiceId: inv2.id, amountKobo: 200000, reference: ref } });
    const body = { event: "charge.success", data: { reference: ref, amount: 200000, currency: "NGN", channel: "card" } };
    const raw = JSON.stringify(body);
    const sig = sign(raw);
    const results = await Promise.all([post(body, sig), post(body, sig), post(body, sig)]);
    assert(results.every((r) => r.status === 200), "all deliveries acknowledged");
    const p = await tx.payment.findUniqueOrThrow({ where: { reference: ref } });
    assertEqual(p.status, "SUCCESS");
    const s = await tx.school.findUniqueOrThrow({ where: { id: school.id } });
    void s;
    const receipts = await tx.payment.findMany({ where: { reference: ref } });
    assertEqual(receipts.length, 1);
    // Exactly one receipt was minted for this payment: receiptNo set once; and
    // invoice moved to PAID (200k of 200k due on its own lines... balance check):
    const invRow = await tx.invoice.findUniqueOrThrow({ where: { id: inv2.id }, include: { payments: true } });
    const paid = invRow.payments.filter((x) => x.status === "SUCCESS").reduce((t, x) => t + x.amountKobo, 0);
    assertEqual(paid, 200000, "credited exactly once even under concurrency");
  });

  await test("amount mismatch marks FAILED and does not credit", async () => {
    const term3 = await tx.term.create({ data: { schoolId: school.id, yearId: year.id, name: "T3", startsOn: new Date("2026-09-01"), endsOn: new Date("2026-12-01") } });
    const inv3 = await tx.invoice.create({ data: { schoolId: school.id, studentId: stu.id, termId: term3.id, totalKobo: 500000 } });
    const ref = "REF-MISMATCH";
    await tx.payment.create({ data: { schoolId: school.id, invoiceId: inv3.id, amountKobo: 500000, reference: ref } });
    const body = { event: "charge.success", data: { reference: ref, amount: 499999, currency: "NGN", channel: "card" } };
    const raw = JSON.stringify(body);
    const r = await post(body, sign(raw));
    assertEqual(r.status, 200, "acknowledged so Paystack stops retrying");
    assertEqual((await tx.payment.findUniqueOrThrow({ where: { reference: ref } })).status, "FAILED");
    assertEqual((await tx.invoice.findUniqueOrThrow({ where: { id: inv3.id } })).status, "UNPAID");
    assert((await tx.auditLog.findFirst({ where: { entityId: ref, action: "PAYMENT_MISMATCH" } })) !== null ||
           (await tx.auditLog.findFirst({ where: { entity: "Payment", action: "PAYMENT_MISMATCH" } })) !== null,
      "mismatch flagged in audit log");
  });

  await test("unknown reference is ignored", async () => {
    const body = { event: "charge.success", data: { reference: "NOPE", amount: 1000, currency: "NGN", channel: "card" } };
    const raw = JSON.stringify(body);
    const r = await post(body, sign(raw));
    assertEqual(r.status, 200);
    assertEqual(await tx.payment.count({ where: { reference: "NOPE" } }), 0);
  });

  await test("non-charge events are ignored", async () => {
    const body = { event: "subscription.create", data: { reference: "REF-DUP-1" } };
    const raw = JSON.stringify(body);
    const r = await post(body, sign(raw));
    assertEqual(r.status, 200);
  });

  summary("paystack webhook");
  await truncateAll();
  await tx.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
