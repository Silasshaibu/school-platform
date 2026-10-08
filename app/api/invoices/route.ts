import { tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";
import { withBalance } from "@/lib/fees";

export const GET = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN", "BURSAR");
  const p = new URL(req.url).searchParams;
  const rows = await tenantDb(school!.id).invoice.findMany({
    where: { ...(p.get("termId") && { termId: p.get("termId")! }), ...(p.get("status") && { status: p.get("status") as any }) },
    include: { payments: true, student: { select: { firstName: true, lastName: true, admissionNo: true, classId: true } } },
    orderBy: { id: "asc" }, take: 200,
  });
  return Response.json(rows.map(withBalance));
});
