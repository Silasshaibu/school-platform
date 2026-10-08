import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { route } from "@/lib/http";
import { provisionSchool } from "@/lib/provision";

const root = () => process.env.ROOT_DOMAIN ?? "localhost:3000";
const urlFor = (slug: string) => `${root().startsWith("localhost") ? "http" : "https"}://${slug}.${root()}`;

export const GET = route(async () => {
  await requireSuperAdmin();
  const [schools, counts] = await Promise.all([
    prisma.school.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, slug: true, plan: true, active: true, createdAt: true } }),
    prisma.student.groupBy({ by: ["schoolId"], where: { status: "ACTIVE" }, _count: { _all: true } }),
  ]);
  const n = new Map(counts.map((c) => [c.schoolId, c._count._all]));
  return Response.json(schools.map((s) => ({ ...s, students: n.get(s.id) ?? 0, url: urlFor(s.slug) })));
});

const RESERVED = ["www", "app", "api", "admin", "platform", "demo-admin"];
const body = z.object({
  name: z.string().min(3).max(80),
  slug: z.string().regex(/^[a-z0-9-]{3,30}$/, "Use 3 to 30 lowercase letters, numbers or hyphens").refine((s) => !RESERVED.includes(s), "That address is reserved"),
  adminName: z.string().min(2), adminEmail: z.string().email(), adminPassword: z.string().min(8).max(100),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const POST = route(async (req: Request) => {
  await requireSuperAdmin();
  const d = body.parse(await req.json());
  try {
    const school = await provisionSchool(d);
    return Response.json({ id: school.id, url: urlFor(school.slug) }, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return Response.json({ error: "That web address is already taken" }, { status: 409 });
    throw e;
  }
});
