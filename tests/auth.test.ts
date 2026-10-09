/**
 * Auth: login per school, role checks on tenant routes (incl. the SUPER_ADMIN
 * crash path from CLAUDE.md "things most likely to be wrong" #2), and the
 * cookie Secure-flag fix for local HTTP.
 */
import { tx, test, assert, assertEqual, rebuildSchema, summary, truncateAll, DEV_URL, TEST_URL, setSchoolSlug, getSessionCookie, logout } from "./harness";
import { make } from "./fixtures";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  rebuildSchema(DEV_URL, TEST_URL);

  const f = await make();
  const { POST: LOGIN } = await import("@/app/api/auth/login/route");
  const { requireRole } = await import("@/lib/auth");

  const login = (email: string, password: string, slug: string | null) => {
    setSchoolSlug(slug);
    return LOGIN(new Request("http://localhost:3000/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }),
    }) as any);
  };

  await test("admin logs in on their own subdomain", async () => {
    const r = await login("admin@demo.test", "Passw0rd!", "demo");
    assertEqual(r.status, 200);
    assert(getSessionCookie(), "session cookie set");
  });

  await test("same credentials fail on another school's subdomain", async () => {
    logout();
    const r = await login("admin@demo.test", "Passw0rd!", "other");
    assertEqual(r.status, 401, "users are per-school");
  });

  await test("wrong password is rejected", async () => {
    logout();
    const r = await login("admin@demo.test", "hunter2", "demo");
    assertEqual(r.status, 401);
  });

  await test("super admin logs in on the root domain (no school)", async () => {
    logout();
    const r = await login("owner@platform.test", "Passw0rd!", null);
    assertEqual(r.status, 200);
    assertEqual((await r.json()).role, "SUPER_ADMIN");
  });

  await test("requireRole: admin on demo subdomain gets the school", async () => {
    logout();
    await login("admin@demo.test", "Passw0rd!", "demo");
    const { session, school } = await requireRole("ADMIN");
    assertEqual(session.role, "ADMIN");
    assertEqual(school!.slug, "demo");
  });

  await test("requireRole: teacher hitting an ADMIN-only route gets 403", async () => {
    logout();
    await login("teacher@demo.test", "Passw0rd!", "demo");
    let status = 0;
    try { await requireRole("ADMIN"); } catch (e) { status = (e as Response).status; }
    assertEqual(status, 403);
  });

  await test("requireRole: no session -> 401", async () => {
    logout();
    let status = 0;
    try { await requireRole("ADMIN"); } catch (e) { status = (e as Response).status; }
    assertEqual(status, 401);
  });

  await test("FIX: super admin blocked from tenant routes instead of crashing on school!.id", async () => {
    logout();
    await login("owner@platform.test", "Passw0rd!", "demo"); // SA session + a tenant subdomain
    let status = 0;
    let err = "";
    try { await requireRole("ADMIN"); } catch (e) { status = (e as Response).status; err = await (e as Response).text(); }
    assertEqual(status, 403, "must not pass through with a null school");
    assert(err !== "", "throws a proper Response");
    // And explicitly: the old behaviour returned school=null while allowing ADMIN code paths.
    logout();
    await login("owner@platform.test", "Passw0rd!", null); // SA on root domain
    let st2 = 0;
    try { const s = await requireRole("ADMIN"); void s.school; st2 = 200; } catch (e) { st2 = (e as Response).status; }
    assertEqual(st2, 403, "SA without a school cannot use tenant routes");
  });

  await test("FIX: suspended school resolves to null (portal stops working)", async () => {
    logout();
    await login("admin@demo.test", "Passw0rd!", "demo");
    await tx.school.update({ where: { id: f.demo.id }, data: { active: false } });
    let status = 0;
    try { await requireRole("ADMIN"); status = 200; } catch (e) { status = (e as Response).status; }
    assertEqual(status, 403, "suspended tenant is locked out");
    await tx.school.update({ where: { id: f.demo.id }, data: { active: true } });
  });

  await test("session cookie is NOT Secure over plain-HTTP local testing", async () => {
    // createSession writes via the shimmed cookies(); inspect jose token round-trip instead:
    const { createSession, getSession } = await import("@/lib/auth");
    await createSession({ uid: f.admin.id, role: "ADMIN", schoolId: f.demo.id });
    const s = await getSession();
    assertEqual(s?.role, "ADMIN", "cookie value verifies back into a session");
    // The secure flag itself is asserted by source contract: only COOKIE_SECURE=true enables it.
    const src = require("fs").readFileSync("lib/auth.ts", "utf8");
    assert(src.includes('secure: process.env.COOKIE_SECURE === "true"'), "secure flag must be opt-in, not NODE_ENV-driven");
  });

  summary("auth & tenancy guard");
  await truncateAll();
  await tx.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
