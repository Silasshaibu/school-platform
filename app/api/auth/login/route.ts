import { prisma } from "@/lib/db";
import { getSchool } from "@/lib/tenant";
import { checkPassword, createSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const school = await getSchool(); // null on the root domain = platform super admin login
  const user = await prisma.user.findFirst({
    where: { email: String(email).toLowerCase(), schoolId: school?.id ?? null, active: true },
  });
  if (!user || !(await checkPassword(String(password), user.passwordHash)))
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  await createSession({ uid: user.id, role: user.role, schoolId: user.schoolId });
  return Response.json({ role: user.role });
}
