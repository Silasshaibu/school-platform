import { z } from "zod";
import { tenantDb } from "@/lib/db";
import { getSchool } from "@/lib/tenant";
import { requireRole } from "@/lib/auth";
import { route } from "@/lib/http";

const body = z.object({
  childName: z.string().min(2).max(120),
  childDob: z.coerce.date().optional(),
  classWanted: z.string().min(2).max(40),
  parentName: z.string().min(2).max(120),
  parentPhone: z.string().min(7).max(20),
  parentEmail: z.string().email().optional(),
});

// Public: the school website's enquiry/application form posts here. Add rate limiting before launch.
export const POST = route(async (req: Request) => {
  const school = await getSchool();
  if (!school) return new Response("School not found", { status: 404 });
  const data = body.parse(await req.json());
  const app = await tenantDb(school.id).application.create({
    data: { ...data, schoolId: school.id, stage: data.childDob ? "APPLIED" : "ENQUIRY" },
    select: { id: true, stage: true },
  });
  return Response.json(app, { status: 201 });
});

export const GET = route(async (req: Request) => {
  const { school } = await requireRole("ADMIN");
  const stage = new URL(req.url).searchParams.get("stage") ?? undefined;
  const apps = await tenantDb(school!.id).application.findMany({
    where: stage ? { stage: stage as any } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return Response.json(apps);
});
