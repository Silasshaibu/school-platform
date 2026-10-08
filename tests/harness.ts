/**
 * Minimal zero-dependency test harness for the school platform.
 *
 * Run with:  npx tsx tests/run-all.ts        (all suites)
 *        or:  npx tsx tests/tenant.test.ts    (single suite)
 *
 * Tests execute against a throwaway Postgres database (TEST_DATABASE_URL) whose
 * schema is rebuilt from the dev database (DATABASE_URL) on every run, so they
 * never touch real data. Route handlers are imported directly; next/headers is
 * shimmed so getSchool()/cookies() work outside the Next.js runtime.
 */
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

export const TEST_URL = process.env.TEST_DATABASE_URL;
if (!TEST_URL) throw new Error("TEST_DATABASE_URL is required (point it at a scratch database!)");

process.env.AUTH_SECRET ??= "test-secret-0123456789abcdef0123456789abcdef";
process.env.ROOT_DOMAIN ??= "localhost:3000";
process.env.PAYSTACK_SECRET_KEY ??= "sk_test_dummy_key_for_signature_checks";

/* ------------------------------------------------------------------ */
/* Shims: headers()/cookies() outside Next.js                          */
/* ------------------------------------------------------------------ */
const cookieStore = new Map<string, string>();
const headerStore = new Map<string, string>();

const mod = require("module") as any;
const origResolve = mod._resolveFilename;
mod._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "next/headers") return "__shim_next_headers__";
  return origResolve.call(this, request, ...rest);
};
require.cache["__shim_next_headers__"] = {
  id: "__shim_next_headers__",
  filename: "__shim_next_headers__",
  loaded: true,
  exports: {
    headers: async () => ({
      get: (k: string) => headerStore.get(k.toLowerCase()) ?? null,
    }),
    cookies: async () => ({
      get: (k: string) => (cookieStore.has(k) ? { value: cookieStore.get(k)! } : undefined),
      set: (k: string, v: string) => cookieStore.set(k, v),
      delete: (k: string) => cookieStore.delete(k),
    }),
  },
} as unknown as NodeModule;

export function setSchoolSlug(slug: string | null) {
  if (slug === null) headerStore.delete("x-school-slug");
  else headerStore.set("x-school-slug", slug);
}
export function getSessionCookie() {
  return cookieStore.get("session");
}
export function logout() {
  cookieStore.delete("session");
}

/* ------------------------------------------------------------------ */
/* Test DB bootstrap                                                   */
/* ------------------------------------------------------------------ */
export const tx = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

/** Prisma URLs carry ?schema=... which libpq does not understand; drop it for psql. */
const pgUrl = (u: string) => u.replace(/\?.*$/, "");

/** Rebuild the test DB schema from the dev DB (enums, tables, defaults, FKs). */
export function rebuildSchema(devUrl: string, testUrl: string) {
  // 1. Enum types with their labels (format_type above prints them by name).
  const enumOut = execSync(
    `psql "${pgUrl(devUrl)}" -AtF'|' -c "
      select t.typname, e.enumsortorder, e.enumlabel
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace and n.nspname = 'public'
      order by t.typname, e.enumsortorder"`,
    { encoding: "utf8" },
  ).trim();
  const enums = new Map<string, string[]>();
  if (enumOut)
    for (const line of enumOut.split("\n")) {
      const [name, , label] = line.split("|");
      enums.set(name, [...(enums.get(name) ?? []), `'${label.replace(/'/g, "''")}'`]);
    }

  const colsOut = execSync(
    `psql "${pgUrl(devUrl)}" -AtF'|' -c "
      select c.relname, a.attname,
             format_type(a.atttypid, a.atttypmod) ||
             case when a.attnotnull then ' NOT NULL' else '' end ||
             coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '')
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid and c.relkind = 'r'
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
      where a.attnum > 0 and not a.attisdropped
      order by c.relname, a.attnum"`,
    { encoding: "utf8" },
  ).trim();

  const byTable = new Map<string, string[]>();
  for (const line of colsOut.split("\n")) {
    const i = line.indexOf("|");
    const t = line.slice(0, i);
    const rest = line.slice(i + 1);
    const j = rest.indexOf("|");
    const def = rest.slice(j + 1);
    byTable.set(t, [...(byTable.get(t) ?? []), `"${rest.slice(0, j)}" ${def}`]);
  }

  const fkOut = execSync(
    `psql "${pgUrl(devUrl)}" -AtF'|' -c "
      SELECT rel.relname, con.conname, att.attname, frel.relname, fatt.attname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_class frel ON frel.oid = con.confrelid
      JOIN LATERAL unnest(con.conkey, con.confkey)
           WITH ORDINALITY AS u(attnum, confattnum, ord) ON true
      JOIN pg_attribute att  ON att.attrelid  = rel.oid  AND att.attnum  = u.attnum
      JOIN pg_attribute fatt ON fatt.attrelid = frel.oid AND fatt.attnum = u.confattnum
      WHERE con.contype = 'f' AND rel.relnamespace = 'public'::regnamespace
      ORDER BY rel.relname, con.conname, u.ord"`,
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("|"));

  // Group composite FK columns by (table, constraint name).
  const fkMap = new Map<string, { table: string; ref: string; cols: string[]; refCols: string[] }>();
  for (const [table, conname, col, reftable, refcol] of fkOut) {
    const key = `${table}.${conname}`;
    const e = fkMap.get(key) ?? { table, ref: reftable, cols: [], refCols: [] };
    e.cols.push(col);
    e.refCols.push(refcol);
    fkMap.set(key, e);
  }

  const stmts: string[] = ["SET client_min_messages TO warning;", "BEGIN;"];
  for (const t of byTable.keys()) stmts.push(`DROP TABLE IF EXISTS "${t}" CASCADE;`);
  for (const [name, labels] of enums) {
    stmts.push(`DROP TYPE IF EXISTS "${name}" CASCADE;`);
    stmts.push(`CREATE TYPE "${name}" AS ENUM (${labels.join(", ")});`);
  }
  for (const [t, defs] of byTable) stmts.push(`CREATE TABLE "${t}" (\n  ${defs.join(",\n  ")}\n);`);
  for (const [key, e] of fkMap) {
    const name = key.slice(key.indexOf(".") + 1);
    stmts.push(
      `ALTER TABLE "${e.table}" ADD CONSTRAINT "${name}" FOREIGN KEY (${e.cols.map((c) => `"${c}"`).join(", ")}) REFERENCES "${e.ref}" (${e.refCols.map((c) => `"${c}"`).join(", ")});`,
    );
  }
  stmts.push("COMMIT;");

  execSync(`psql "${pgUrl(testUrl)}" -v ON_ERROR_STOP=1 -q <<'SQL'\n${stmts.join("\n")}\nSQL`, {
    stdio: "inherit",
  });
}

/* ------------------------------------------------------------------ */
/* Tiny runner                                                         */
/* ------------------------------------------------------------------ */
let passed = 0;
let failed = 0;
const failures: string[] = [];

export async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
    failures.push(`${name}\n${msg}`);
    console.log(`  ✗ ${name}\n    ${msg.split("\n").slice(0, 4).join("\n    ")}`);
  }
}

export function assert(cond: unknown, msg = "assertion failed") {
  if (!cond) throw new Error(msg);
}

export function assertEqual<T>(actual: T, expected: T, msg?: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(msg ?? `expected ${b}, got ${a}`);
}

export function summary(suite: string) {
  console.log(`\n${suite}: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) console.error(`FAILED - ${f}`);
    process.exitCode = 1;
  }
}

/** Delete all rows from every tenant-bearing table (FK-safe order). */
export async function truncateAll() {
  const tables = [
    "AuditLog","InviteToken","Announcement","ReportCard","Score","Attendance","Payment",
    "InvoiceLine","Invoice","FeeStructure","FeeItem","Document","Application",
    "StudentGuardian","Guardian","Student","ClassSubject","Subject","SchoolClass",
    "Term","AcademicYear","User","School",
  ];
  await tx.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE;`);
}
