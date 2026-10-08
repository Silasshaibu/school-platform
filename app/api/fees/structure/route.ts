import { z } from "zod";
import { tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";

export const GET = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN", "BURSAR");
  const termId = new URL(req.url).searchParams.get("termId");
  if (!termId) return Response.json({ error: "termId required" }, { status: 400 });
  return Response.json(await tenantDb(school!.id).feeStructure.findMany({
    where: { termId }, include: { feeItem: true, class: true },
  }));
});

const body = z.object({
  termId: z.string(), classId: z.string(),
  items: z.array(z.object({ feeItemId: z.string(), amountKobo: z.number().int().min(0) })).min(1),
});

// Set (or update) what a class pays for a term, item by item.
export const PUT = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN", "BURSAR");
  const sid = school!.id;
  const { termId, classId, items } = body.parse(await req.json());
  const db = tenantDb(sid);
  await db.$transaction(
    items.map((it) =>
      db.feeStructure.upsert({
        where: { classId_termId_feeItemId: { classId, termId, feeItemId: it.feeItemId } },
        update: { amountKobo: it.amountKobo },
        create: { schoolId: sid, classId, termId, feeItemId: it.feeItemId, amountKobo: it.amountKobo },
      })
    )
  );
  return Response.json({ ok: true });
});
