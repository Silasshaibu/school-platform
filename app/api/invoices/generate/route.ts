import { z } from "zod";
import { prisma, tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";
import { familyKey } from "@/lib/fees";

const body = z.object({ termId: z.string(), classId: z.string().optional() });

// Safe to re-run: students who already have an invoice for the term are skipped.
export const POST = route(async (req: Request) => {
  const { school, session } = await requireRole("ADMIN", "BURSAR");
  const sid = school!.id;
  const { termId, classId } = body.parse(await req.json());
  const db = tenantDb(sid);
  const pct = (await prisma.school.findUniqueOrThrow({ where: { id: sid } })).siblingDiscountPercent;

  // Rank children per family (by primary guardian phone) across ALL active students,
  // so the discount is the same whether you generate per class or school-wide.
  const all = await db.student.findMany({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  const links = await db.studentGuardian.findMany({
    where: { isPrimary: true, studentId: { in: all.map((s) => s.id) } }, include: { guardian: true },
  });
  const famOf = new Map(links.map((l) => [l.studentId, familyKey(l.guardian.phone)]));
  const seen = new Map<string, number>();
  const rank = new Map<string, number>();
  for (const s of all) {
    const k = famOf.get(s.id);
    const n = k ? seen.get(k) ?? 0 : 0;
    rank.set(s.id, n);
    if (k) seen.set(k, n + 1);
  }

  const fees = await db.feeStructure.findMany({ where: { termId }, include: { feeItem: true } });
  const existing = new Set((await db.invoice.findMany({ where: { termId }, select: { studentId: true } })).map((i) => i.studentId));
  let created = 0, skipped = 0, noFees = 0;

  for (const s of all.filter((s) => !classId || s.classId === classId)) {
    if (existing.has(s.id)) { skipped++; continue; }
    const lines = fees.filter((f) => f.classId === s.classId);
    if (!lines.length) { noFees++; continue; }
    const total = lines.reduce((t, l) => t + l.amountKobo, 0);
    const discountKobo = (rank.get(s.id) ?? 0) > 0 ? Math.round((total * pct) / 100) : 0;
    await db.$transaction(async (tx) => {
      const inv = await tx.invoice.create({ data: { schoolId: sid, studentId: s.id, termId, totalKobo: total, discountKobo } });
      await tx.invoiceLine.createMany({
        data: lines.map((l) => ({ schoolId: sid, invoiceId: inv.id, description: l.feeItem.name, amountKobo: l.amountKobo })),
      });
    });
    created++;
  }
  await prisma.auditLog.create({ data: { schoolId: sid, userId: session.uid, action: "GENERATE_INVOICES", entity: "Term", entityId: termId } });
  return Response.json({ created, skippedExisting: skipped, classesWithoutFees: noFees });
});
