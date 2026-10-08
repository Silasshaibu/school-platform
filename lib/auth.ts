import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { getSchool } from "./tenant";

const key = new TextEncoder().encode(process.env.AUTH_SECRET);
export type Session = { uid: string; role: Role; schoolId: string | null };

export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const checkPassword = (p: string, hash: string) => bcrypt.compare(p, hash);

export async function createSession(s: Session) {
  const token = await new SignJWT(s).setProtectedHeader({ alg: "HS256" }).setExpirationTime("7d").sign(key);
  (await cookies()).set("session", token, {
    httpOnly: true, sameSite: "lax", path: "/",
    // Secure cookies require HTTPS; local production testing runs over plain HTTP,
    // so opt in explicitly with COOKIE_SECURE=true once served behind HTTPS.
    secure: process.env.COOKIE_SECURE === "true", maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<Session | null> {
  const t = (await cookies()).get("session")?.value;
  if (!t) return null;
  try { return (await jwtVerify(t, key)).payload as unknown as Session; } catch { return null; }
}

/** Use at the top of every route/page: returns the session and the current school. */
export async function requireRole(...roles: Role[]) {
  const s = await getSession();
  if (!s) throw new Response("Unauthorized", { status: 401 });
  const school = await getSchool();
  // Tenant routes need a resolved, active school; without one even SUPER_ADMIN
  // gets a clean 403 instead of crashing later on `school!.id`. Platform-owner
  // endpoints must use requireSuperAdmin() (or impersonation, when built).
  if (!school) throw new Response("Forbidden", { status: 403 });
  const ok = s.role === "SUPER_ADMIN" || (s.schoolId === school.id && roles.includes(s.role));
  if (!ok) throw new Response("Forbidden", { status: 403 });
  return { session: s, school };
}

/** Platform owner only (no school context). */
export async function requireSuperAdmin() {
  const s = await getSession();
  if (!s) throw new Response("Unauthorized", { status: 401 });
  if (s.role !== "SUPER_ADMIN") throw new Response("Forbidden", { status: 403 });
  return s;
}
