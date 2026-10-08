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
