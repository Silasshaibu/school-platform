import { z } from "zod";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { getSchool } from "@/lib/tenant";
import { hashPassword, createSession } from "@/lib/auth";
import { route } from "@/lib/http";
import { familyKey } from "@/lib/fees";

const gone = () => Response.json({ error: "This invite is invalid or has expired" }, { status: 410 });
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

async function load(token: string) {
  const school = await getSchool();
  if (!school || !/^[a-f0-9]{64}$/.test(token)) return null;
  const inv = await prisma.inviteToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!inv || inv.schoolId !== school.id || inv.usedAt || inv.expiresAt < new Date()) return null;
  const guardian = await prisma.guardian.findUnique({ where: { id: inv.guardianId } });
  return guardian?.email ? { school, inv, guardian } : null;
}

// Lets the accept page show "Welcome, <name>" before they set a password.
export const GET = route(async (req: Request) => {
  const ctx = await load(new URL(req.url).searchParams.get("token") ?? "");
  return ctx ? Response.json({ name: ctx.guardian.name, email: ctx.guardian.email, school: ctx.school.name }) : gone();
});

const body = z.object({ token: z.string(), password: z.string().min(8).max(100) });

export const POST = route(async (req: Request) => {
  const { token, password } = body.parse(await req.json());
  const ctx = await load(token);
  if (!ctx) return gone();
  const { school, inv, guardian } = ctx;
  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const claim = await tx.inviteToken.updateMany({ where: { id: inv.id, usedAt: null }, data: { usedAt: new Date() } });
      if (claim.count === 0) throw gone(); // someone used it a moment ago
      const u = await tx.user.create({
        data: { schoolId: school.id, email: guardian.email!.toLowerCase(), passwordHash, name: guardian.name, role: "PARENT" },
      });
      // One parent, many children: link every unclaimed guardian record with the same phone number.
      const pool = await tx.guardian.findMany({ where: { schoolId: school.id, userId: null } });
      const mine = pool.filter((g) => familyKey(g.phone) === familyKey(guardian.phone)).map((g) => g.id);
      await tx.guardian.updateMany({ where: { id: { in: mine } }, data: { userId: u.id } });
      return u;
    });
  } catch (e: any) {
    if (e?.code === "P2002") return Response.json({ error: "An account with this email already exists" }, { status: 409 });
    throw e;
  }
  await createSession({ uid: user.id, role: user.role, schoolId: user.schoolId });
  return Response.json({ role: user.role }, { status: 201 });
});
