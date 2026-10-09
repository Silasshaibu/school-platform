import { prisma, tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";
import { withBalance } from "@/lib/fees";

export const GET = route(async () => {
  const { school, session } = await requireRole("PARENT");
  const db = tenantDb(school!.id);
  const kids = await db.studentGuardian.findMany({ where: { guardian: { userId: session.uid } }, select: { studentId: true } });
  const rows = await db.invoice.findMany({
    where: { studentId: { in: kids.map((k) => k.studentId) } },
    include: { payments: { where: { status: "SUCCESS" } }, student: { select: { firstName: true, lastName: true } }, term: { select: { name: true } } },
  });
  return Response.json(rows.map(withBalance));
});
