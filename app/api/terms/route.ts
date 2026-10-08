import { z } from "zod";
import { tenantDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";

export const GET = route(async () => {
  const { school } = await requireRole("ADMIN", "BURSAR", "TEACHER");
  return Response.json(await tenantDb(school!.id).term.findMany({ include: { year: { select: { name: true } } }, orderBy: { startsOn: "desc" } }));
});

const body = z.object({ yearName: z.string().min(4), name: z.string().min(2), startsOn: z.coerce.date(), endsOn: z.coerce.date() })
  .refine((v) => v.endsOn > v.startsOn, "Term must end after it starts");

// Creates the academic year on first use, then the term, and makes it the current term.
export const POST = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN");
  const sid = school!.id;
  const d = body.parse(await req.json());
  const db = tenantDb(sid);
  const year = (await db.academicYear.findFirst({ where: { name: d.yearName } }))
    ?? (await db.academicYear.create({ data: { schoolId: sid, name: d.yearName, startsOn: d.startsOn, endsOn: d.endsOn } }));
  await db.term.updateMany({ where: { current: true }, data: { current: false } });
  const term = await db.term.create({ data: { schoolId: sid, yearId: year.id, name: d.name, startsOn: d.startsOn, endsOn: d.endsOn, current: true } });
  return Response.json(term, { status: 201 });
});
