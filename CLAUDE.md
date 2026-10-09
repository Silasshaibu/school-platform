# School Platform: handoff for Claude Code

Multi-tenant school management SaaS for Nigerian Nursery to Primary 5 schools. The owner (Silas) builds one platform and sells it to many schools, each on its own subdomain, with the operating playbook as the other half of the product (see docs/BLUEPRINT.md).

## STATUS: written but NEVER compiled or run
Everything here was authored without installing dependencies or running a build (the sandbox could not download Prisma engines). Treat it as a well-planned first draft. Your first job is to make it build and run, then verify each flow end to end.

## First steps (in order)
1. `npx create-next-app@latest` (TypeScript, App Router, Tailwind, `@/*` alias) in a fresh folder, then copy this project's files over it. Keep the generated `globals.css`, `tsconfig.json`, and Tailwind config. `app/layout.tsx` here replaces the generated one.
2. `npm i @prisma/client prisma bcryptjs jose zod && npm i -D tsx @types/bcryptjs`
3. `.env`: DATABASE_URL (Postgres), AUTH_SECRET (long random), ROOT_DOMAIN=localhost:3000, PAYSTACK_SECRET_KEY, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD.
4. `npx prisma format` (the schema was written with relations declared on one side only; format adds the back-references), then `npx prisma validate`, then `npx prisma migrate dev --name init`, then `npm run seed`.
5. `npx tsc --noEmit` and `npm run build`. Fix every error. Then run it and open http://demo.localhost:3000 (admin@demo.test / ChangeMe123!).
6. Write tests for the risky parts (see below) before adding features.

## Architecture rules (keep these)
- **Tenancy:** every tenant table has `schoolId`. Tenant data is accessed only through `tenantDb(school.id)` in `lib/db.ts` (Prisma client extension that scopes reads and stamps creates). School is resolved from the subdomain by `middleware.ts` (sets `x-school-slug`) and `lib/tenant.ts`. Suspended schools resolve to null.
- **Auth:** signed JWT in an httpOnly cookie (`lib/auth.ts`). Every route starts with `requireRole(...)` (throws a Response on failure). Wrap handlers in `route()` from `lib/http.ts` (turns thrown Responses and zod errors into proper replies). Platform owner uses `requireSuperAdmin()` and has no school.
- **Money:** integers in kobo. Format with `naira()` in `lib/client.ts`.
- **Payments:** Paystack. `Payment.reference` is unique and the webhook claims a payment atomically (`updateMany where status=PENDING`), so duplicate webhooks cannot double-credit.
- **UI:** mobile-first (parents are on phones), Tailwind, per-school `--brand` colour set in `app/layout.tsx`, fonts Bricolage Grotesque (headings) and Figtree (body). Pass `schoolId`/scalar ids on creates, never nested `connect`.

## File map
- `prisma/schema.prisma`, `prisma/seed.ts` (demo school, classes, subjects, grade scale, optional super admin)
- `lib/`: db, auth, tenant, http, fees, paystack, admission (admission numbers), admissions (stage transitions), grading, report (standings and report card), provision (create a whole school), client (fetch helper, styles)
- `app/api/`: applications (+enroll), students (+guardians), guardians (+invite), auth (login, logout, accept-invite, change-password), classes, terms, school, subjects, class-subjects, fees, invoices (+generate, +pay), parent/invoices, webhooks/paystack, attendance, scores, report-cards (+lock), staff, me, platform/schools
- Screens: /login, /accept-invite, /parent, /pay/complete, /report/[studentId], /account, /admin/{applications,students,attendance,scores,reports,fees,subjects,staff}, /platform

## Built so far
Admissions pipeline and enrolment; students and guardians; parent invite links (one parent, many children, linked by phone); fee structures, invoice generation with sibling discount, Paystack checkout and webhook; attendance; scores (Test 1 /20, Test 2 /20, Exam /60); subjects; staff accounts; report cards with positions, remarks, lock/release, optional fee-hold, printable view; platform owner panel with one-step school provisioning, plans, suspend.

## Things most likely to be wrong (check first)
1. `tenantDb` extension: typing of `create`/`createMany`/`upsert`, `findUnique` with an extra `schoolId` in `where` (needs Prisma 5+ extendedWhereUnique), and `$transaction` (both array and interactive forms) on the extended client. If transactions do not carry the extension, scope manually inside them.
2. `requireRole` lets SUPER_ADMIN through everywhere, but on the root domain `school` is null and routes use `school!.id` (crash). Decide: block SUPER_ADMIN from tenant routes, or support impersonation properly.
3. Next.js version: `middleware.ts` is pinned for Next 15. Newer majors may rename it. `params`/`searchParams` are Promises (Next 15 style).
4. `useSearchParams` was avoided; confirm pages build without Suspense warnings.
5. Guardian rows are created per child at enrolment, so siblings have separate guardian rows linked by phone number on invite acceptance. Consider a proper shared Guardian/family model.
6. Phone-to-WhatsApp conversion assumes Nigerian numbers (leading 0 becomes 234).
7. Paystack uses one platform key, so all money lands in the owner's account. Real schools need Paystack subaccounts with split payments before launch.

## Not built yet (suggested order)
1. Forgot-password flow (email or WhatsApp/SMS token). Required before real users.
2. Sending invites and receipts (email/SMS/WhatsApp); right now the admin copies a link.
3. Announcements and parent notifications.
4. Parent view of attendance; simple parent dashboard per child.
5. Direct "Add student" screen (API exists: POST /api/students) and document upload and verification checklist (Document model exists, no storage or UI).
6. Teacher-to-subject assignment (ClassSubject.teacherId exists; currently any teacher can score any subject).
7. Year-end promotion workflow; void invoice; receipt PDF; audit log viewer; rate limiting on the public application form.
8. Subscription billing for schools (Plan is only a label).
9. Tests: tenant isolation, webhook idempotency, invoice generation and sibling discount, report card positions, stage transitions.

## Conventions
Keep responses and UI copy plain and kind (parents are not technical). No heavy dependencies without need. Money in kobo. Every mutation that matters writes an `AuditLog` row.

File name: middleware.ts
Language: 
import { NextRequest, NextResponse } from "next/server";

// acme.yourplatform.com -> x-school-slug: acme (client-sent value is always overwritten)
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const root = process.env.ROOT_DOMAIN ?? "localhost:3000";
  const sub = host !== root && host.endsWith(root) ? host.slice(0, -(root.length + 1)).split(".")[0] : null;
  const h = new Headers(req.headers);
  if (sub && sub !== "www") h.set("x-school-slug", sub);
  else h.delete("x-school-slug");
  return NextResponse.next({ request: { headers: h } });
}
export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };

File name: package.json
Language: 
{
  "name": "school-platform",
  "private": true,
  "scripts": { "dev": "next dev", "build": "next build", "seed": "tsx prisma/seed.ts" },
  "prisma": { "seed": "tsx prisma/seed.ts" },
  "dependencies": { "@prisma/client": "^6.0.0", "bcryptjs": "^2.4.3", "jose": "^5.9.0", "zod": "^3.23.0", "next": "^15.0.0", "react": "^19.0.0", "react-dom": "^19.0.0" },
  "devDependencies": { "@types/bcryptjs": "^2.4.6", "@types/node": "^22.0.0", "prisma": "^6.0.0", "tsx": "^4.19.0", "typescript": "^5.6.0" }
}

File name: README.md
Language: 
# School Platform (Phase 1, step 1-2: tenancy, auth, data model)

## Setup
1. `npx create-next-app@latest school-platform --ts --app --tailwind`, then copy these files over it (keep your generated config).
2. `npm i @prisma/client prisma bcryptjs jose && npm i -D tsx @types/bcryptjs`
3. `.env`:
   DATABASE_URL=postgresql://user:pass@localhost:5432/school
   AUTH_SECRET=<long random string>
   ROOT_DOMAIN=localhost:3000
4. `npx prisma migrate dev --name init && npm run seed`
5. `npm run dev`, then open http://demo.localhost:3000 (login: admin@demo.test / ChangeMe123!, change it).

## Rules
- Tenant data is only ever touched through `tenantDb(school.id)` (lib/db.ts).
- Call `requireRole(...)` at the top of every route/page.
- Payments: `reference` is unique, so a repeated gateway webhook can't double-credit.

## Admissions and students (API)
- POST /api/applications (public, per school subdomain) | GET /api/applications?stage=
- PATCH /api/applications/:id (stage, assessmentScore, notes), enforced transitions
- POST /api/applications/:id/enroll (ACCEPTED -> student + guardian, admission number)
- GET/POST /api/students | GET/PATCH /api/students/:id | POST /api/students/:id/guardians

## Fees and payments
Env: `PAYSTACK_SECRET_KEY`. In the Paystack dashboard set the webhook URL to `https://<your-root-domain>/api/webhooks/paystack`.
- POST /api/fees/items | PUT /api/fees/structure (per class, per term)
- POST /api/invoices/generate {termId, classId?}: idempotent, applies the sibling discount (School.siblingDiscountPercent)
- GET /api/invoices (admin/bursar) | GET /api/parent/invoices
- POST /api/invoices/:id/pay -> Paystack checkout URL; the webhook confirms the payment and issues the receipt

## Parent accounts
- POST /api/guardians/:id/invite (admin) -> one-time link, valid 7 days (share by WhatsApp/SMS/email)
- GET/POST /api/auth/accept-invite: parent sets a password; all guardian records with the same phone are linked, so siblings appear under one login
- Re-run `npx prisma format && npx prisma migrate dev` (InviteToken added; Guardian.userId is no longer unique)

## Screens
/login, /accept-invite?token=, /parent (fees and Pay), /pay/complete, /admin/applications (pipeline and enrol).
app/layout.tsx replaces the generated one (per-school name, logo, and brand colour). Keep the generated globals.css.

## Admin screens
/admin/students (search, guardian contacts, parent invite link with WhatsApp share), /admin/fees (term setup, fee items, per-class amounts, sibling discount, generate invoices, collections). Sign out in the admin nav.
Extra API: GET /api/classes, GET/POST /api/terms, GET/PATCH /api/school, PATCH /api/guardians/:id, POST /api/auth/logout.

## Attendance, scores, staff
- Teachers sign in and land on /admin/attendance. Daily register: Present/Absent/Late, saved per class per date.
- /admin/scores: Test 1 (20), Test 2 (20), Exam (60), total 100 (see lib/grading.ts). Locked once report cards are locked.
- /admin/subjects: which classes take which subjects (seed adds sensible defaults). /admin/staff: add teachers and bursars; /account: change password.
- Any teacher can enter scores for any class and subject. Per-teacher subject assignment is not enforced yet.

## Report cards
/admin/reports: class view with totals, averages, positions (ties share), teacher and head remarks, lock/release.
/report/:studentId?termId=: printable card (Print or save as PDF). Parents see it only when locked, and, if the school turns on the fee-hold option in Fees, only when the term's fees are paid.

## Platform owner
Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`, run `npm run seed`, then sign in on the ROOT domain (no subdomain) at /login: it opens /platform.
There you add schools (each gets its own address, admin login, classes, subjects, grading scale), set a plan, and suspend or reactivate. Re-run `npx prisma migrate dev` (School.plan and School.active added).
