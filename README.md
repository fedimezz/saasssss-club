# Le Club de Gammarth — SaaS Multi-Tenant Platform

> **Stack:** Next.js 16 · TypeScript · Prisma 5 · PostgreSQL · Tailwind CSS v4 · JWT · Upstash Redis · Cloudinary · Konnect · Brevo (email) · Twilio

A full-stack, multi-tenant SaaS platform for sports club management. Each gym gets its own subdomain (`slug.yoursaas.com`), isolated data, custom branding, and a self-service billing flow.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Multi-Tenancy Model](#multi-tenancy-model)
3. [Roles & Permissions](#roles--permissions)
4. [Feature Map](#feature-map)
5. [Database Schema Summary](#database-schema-summary)
6. [API Reference](#api-reference)
7. [Authentication Flow](#authentication-flow)
8. [Payment Flow (Konnect)](#payment-flow-konnect)
9. [SaaS Billing (Plan Limits)](#saas-billing-plan-limits)
10. [Testing](#testing)
11. [Project Status — Phases 0–12](#project-status--phases-012)
12. [Setup & Environment Variables](#setup--environment-variables)
13. [Deployment (Vercel)](#deployment-vercel)
14. [Key Files Reference](#key-files-reference)

---

## Architecture Overview

```
Browser
  │
  ▼
proxy.ts (Next.js Edge Middleware)
  │  • Resolves subdomain → x-club-slug header
  │  • Verifies JWT (Jose, Edge-compatible)
  │  • Role-based route guards (OWNER / ADMIN / COACH / MEMBER / SUPER_ADMIN)
  │  • Global rate limiting (Upstash Redis, 60 req/min per user)
  │  • CSRF origin check on all state-mutating requests
  │
  ▼
Next.js App Router (108 pages)
  │
  ├── /app/(public)        Marketing site, landing, offres
  ├── /app/onboarding      3-step club creation wizard
  ├── /app/dashboard       Member + Coach dashboards
  ├── /app/admin           Owner + Admin management panels
  └── /app/platform        Super-admin control plane
  │
  ▼
API Routes (/app/api/**)
  │  • Every route calls requireAdmin/requireOwner/requireUser/requireCoach
  │  • Every Prisma query includes clubId (never trusts client-supplied value)
  │  • plan-limits.ts enforces SaaS tier limits before any write
  │
  ▼
Prisma 5 → PostgreSQL
Cloudinary (images) · Upstash Redis (rate limit) · Konnect (payments)
Brevo (email) · Twilio (SMS)
```

---

## Multi-Tenancy Model

| Concept | Implementation |
|---|---|
| Tenant unit | `Club` row with a unique `slug` |
| Subdomain routing | `slug.yoursaas.com` → proxy injects `x-club-slug` header |
| Tenant resolution | `lib/tenant.ts → resolveTenantFromRequest()` reads the header, looks up `clubId` |
| Data isolation | Every DB model has a `clubId` FK. Every query `WHERE clubId = ?` |
| Cross-tenant guard | `requireAdmin()` re-reads `clubId` from the DB — JWT value is ignored for the WHERE clause |
| Local dev | `club-a.localhost:3000` → gym A, `club-b.localhost:3000` → gym B, plain `localhost:3000` → platform (no env var needed) |

**Security contract:** A token from Club A used on Club B's subdomain is rejected at the `requireX()` layer — the user's `clubId` from the DB is compared against the resolved club from the subdomain.

---

## Roles & Permissions

| Role | Scope | Access |
|---|---|---|
| `SUPER_ADMIN` | Platform | All clubs, no `clubId`. `/platform` route tree |
| `OWNER` | Club | Full access + SaaS plan management + analytics + billing |
| `ADMIN` | Club | Operational access (members, sessions, coaches, payments). No analytics/billing |
| `COACH` | Club | Own sessions + roster only |
| `MEMBER` | Club | Personal dashboard (bookings, membership, schedule, profile) |

Granular RBAC is in `lib/permissions.ts`. Custom overrides stored in `role_permissions` table (per-club, per-role, per-action).

---

## Feature Map

### Member Dashboard `/dashboard`
- Personal KPI cards (active subscription, bookings this week, sessions attended)
- Booking flow — browse schedule, book/cancel sessions
- Membership page — subscribe to a plan, resume pending payment
- Profile management (name, phone, avatar, password, preferences)
- Notification center + real-time SSE bell

### Coach Dashboard `/dashboard/coach`
- Stats widget (totalSessions, bookings, attendances, fillRate)
- Session roster with expandable member list + manual attendance marking

### Admin Panel `/admin`
- **Members** — CRUD, search/filter/paginate, manual plan assignment
- **Staff** — Coaches and admins management
- **Schedule** — Weekly plan builder, session management, activation/archive
- **Bookings** — View/cancel all bookings, sort by session/member/date
- **Subscriptions** — Approve/cancel/suspend member subscriptions
- **Payments** — Manual payment recording, Konnect webhook status
- **Plans** — Gym membership plan CRUD (pricing, duration, quotas)
- **Promotions** — Discount codes with validity windows
- **Reports** — Member-submitted reports, status workflow
- **Notifications** — Broadcast + individual notification management
- **Roles** — RBAC toggle matrix per role
- **Content** — Website page content editor
- **Logs** — Full activity audit log with filters
- **Settings** — Branding, colors, logo, hero image, social links, working hours
- **Billing** — SaaS subscription status, trial countdown, upgrade CTA

### Platform (Super Admin) `/platform`
- Clubs list with status (ACTIVE / TRIAL / SUSPENDED)
- Per-club detail: suspend, activate, change SaaS plan
- Platform-wide activity logs
- SaaS plan management
- System health overview

### Website Builder
- Each club has a public website at `slug.yoursaas.com` with pages: Home, Schedule, Coaches, Pricing, Contact
- Pages toggled per club via `GymSettings.enabledPages`
- `ClubSettingsContext` applies `--primary` CSS variable in real-time
- Content editable from `/admin/content`

### Onboarding `/onboarding`
- 3-step wizard: account → club info → plan selection
- Atomic transaction: Club + OWNER User + ClubSubscription (TRIALING) + GymSettings
- 14-day trial auto-configured
- Auto-login after creation (JWT cookie set)
- Rate-limited (5 clubs per IP per hour)

---

## Database Schema Summary

| Model | Table | Key relations |
|---|---|---|
| `Club` | `clubs` | Has many Users, GymSettings (1:1), ClubSubscription (1:1) |
| `User` | `users` | Belongs to Club. Roles: OWNER/ADMIN/COACH/MEMBER |
| `GymSettings` | `gym_settings` | 1:1 with Club. Branding, pages, social links |
| `SaasPlan` | `saas_plans` | STARTER / PRO / BUSINESS. JSON `limits` field |
| `ClubSubscription` | `club_subscriptions` | 1:1 with Club. Status: TRIALING/ACTIVE/SUSPENDED/CANCELLED |
| `MembershipPlan` | `membership_plans` | Per-club gym membership (monthly/yearly/etc.) |
| `Subscription` | `subscriptions` | Member → MembershipPlan. Status: PENDING/ACTIVE/EXPIRED |
| `Payment` | `payments` | Konnect payment per subscription. Status: PENDING/PAID/FAILED |
| `Coach` | `coaches` | Staff profile with specialties, bio, photo |
| `WeeklyPlan` | `weekly_plans` | Per-club weekly schedule template |
| `Session` | `sessions` | Specific session in a WeeklyPlan (day, time, capacity) |
| `UserSession` | `user_sessions` | Booking: User ↔ Session |
| `Attendance` | `attendances` | Coach marks member present |
| `Notification` | `notifications` | In-app + SSE real-time |
| `ActivityLog` | `activity_logs` | Audit trail for all admin/owner actions |
| `MemberReport` | `member_reports` | Member → Admin reports |
| `Promotion` | `promotions` | Discount codes with usage limits |
| `Post` | `posts` | Club announcements/feed with likes + comments |
| `RolePermission` | `role_permissions` | Per-club RBAC overrides |
| `PageContent` | `page_content` | Editable website content blocks per page |

**Indexes added (Phase 10):**
- `UserSession`: `[clubId, isCancelled]`, `[clubId, bookedAt]`, `[userId, clubId]`
- `Coach`: `[clubId, isActive]`
- `SaasPayment`: `[status]`, `[clubId, paidAt]`
- `MemberReport`: `[clubId, status]`

---

## API Reference

All routes are under `/api/`. Every route is clubId-scoped via `requireX()` guard.

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Email + password login |
| POST | `/api/auth/register` | Public | Member self-registration |
| POST | `/api/auth/logout` | Any | Clear JWT cookie |
| GET | `/api/auth/me` | Any | Current user info |
| GET | `/api/auth/google` | Public | OAuth redirect |
| GET | `/api/auth/callback/google` | Public | OAuth callback |
| POST | `/api/auth/request-otp` | Public | Phone OTP request |
| POST | `/api/auth/verify-otp` | Public | OTP verification |

### Onboarding
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/onboarding/create-club` | Public | Atomic club creation |

### Admin — Members
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/members` | ADMIN+ | List with search/paginate |
| POST | `/api/admin/members` | ADMIN+ | Create member (checks maxMembers limit) |
| GET | `/api/admin/members/[id]` | ADMIN+ | Member detail |
| PATCH | `/api/admin/members/[id]` | ADMIN+ | Update member |
| DELETE | `/api/admin/members/[id]` | OWNER | Delete member |
| POST | `/api/admin/members/[id]/subscribe` | ADMIN+ | Assign membership plan |

### Admin — Coaches & Staff
| Method | Path | Auth | Description |
|---|---|---|---|
| GET/POST | `/api/admin/coaches` | ADMIN+ | List / create coach |
| GET/PATCH/DELETE | `/api/admin/coaches/[id]` | ADMIN+ | Coach CRUD |
| GET/POST | `/api/admin/staff` | OWNER | List / invite staff |
| PATCH/DELETE | `/api/admin/staff/[id]` | OWNER | Staff management |

### Admin — Schedule
| Method | Path | Auth | Description |
|---|---|---|---|
| GET/POST | `/api/admin/schedule` | ADMIN+ | Weekly plans |
| GET/PATCH/DELETE | `/api/admin/schedule/[id]` | ADMIN+ | Session management |
| POST/PATCH/DELETE | `/api/admin/schedule/plan/[id]` | OWNER | Plan activate/archive/delete |

### Admin — Financials
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/payments` | OWNER | Payment list |
| POST | `/api/admin/payments` | OWNER | Manual payment record |
| GET/PATCH | `/api/admin/subscriptions` | ADMIN+ | Subscription management |
| GET | `/api/admin/analytics` | OWNER | KPI analytics (feature-gated) |

### Billing (SaaS)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/billing/status` | OWNER | Current SaaS plan + trial status |
| POST | `/api/billing/upgrade` | OWNER | Upgrade/downgrade plan |

### Dashboard (Member/Coach)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/dashboard` | MEMBER+ | Personal KPIs |
| GET/POST/DELETE | `/api/dashboard/bookings` | MEMBER | Booking management |
| GET | `/api/dashboard/membership` | MEMBER | Subscription status + plans |
| POST | `/api/dashboard/membership/subscribe` | MEMBER | Initiate subscription payment |
| GET | `/api/dashboard/schedule` | MEMBER+ | Public schedule view |
| GET | `/api/dashboard/coach/stats` | COACH | Coach performance stats |
| POST | `/api/dashboard/coach/attendance` | COACH | Mark attendance |

### Payments (Konnect)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/payments/konnect/initiate` | MEMBER | Create Konnect payment link |
| GET | `/api/payments/konnect/webhook` | Public | Konnect webhook (idempotent) |

### Platform (Super Admin)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/platform/clubs` | SUPER_ADMIN | All clubs list |
| GET/POST | `/api/platform/clubs/[id]` | SUPER_ADMIN | Club detail + actions |
| GET | `/api/platform/logs` | SUPER_ADMIN | Platform-wide audit logs |
| GET | `/api/platform/system` | SUPER_ADMIN | System health |

### Infrastructure
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | Public | DB + Redis liveness check |
| GET | `/api/sse` | Any | Server-Sent Events for notifications |
| GET | `/api/cron/trial-check` | CRON_SECRET | Suspend expired trials |
| GET | `/api/cron/subscription-renewal` | CRON_SECRET | Process renewals |
| GET | `/api/cron/session-reminders` | CRON_SECRET | Send session reminder notifications |

---

## Authentication Flow

```
1. User POSTs /api/auth/login {email, password}
2. Server: bcrypt.compare → fetch user from DB (with clubId)
3. generateToken({ id, email, role, name, clubId }) → signed JWT (7 days)
4. Response: Set-Cookie: token=<JWT>; HttpOnly; SameSite=Lax; Secure (CSRF covered by the Origin check in proxy.ts)
5. Subsequent requests: proxy.ts reads cookie → verifyToken() → JWTPayload
6. requireX(request): re-fetches user from DB to get current role/clubId
   (JWT value is NOT trusted for DB scoping — DB is the source of truth)
7. Every Prisma query: WHERE clubId = <DB-verified clubId>
```

**Google OAuth:** `/api/auth/google` → Google → `/api/auth/callback/google` → creates/finds user → same JWT cookie flow.

---

## Payment Flow (Konnect)

```
Member selects plan
       │
       ▼
POST /api/dashboard/membership/subscribe
  → checkLimit(maxBookingsPerMonth)
  → creates Subscription (PENDING) + Payment (PENDING)
  → calls Konnect API → gets payment URL
  → returns { paymentUrl }
       │
       ▼
Member completes payment on Konnect
       │
       ▼
Konnect GETs /api/payments/konnect/webhook?payment_ref=<ref>
  → finds Payment by transactionId
  → IDEMPOTENCY: if status already PAID → redirect success (no writes)
  → getKonnectPaymentDetails(ref) → verify amount + status
  → $transaction([
      payment.update({ status: "PAID" }),
      subscription.update({ status: "ACTIVE", startDate, endDate })
    ])
  → redirect to /dashboard/membership?payment=success
```

---

## SaaS Billing (Plan Limits)

`lib/plan-limits.ts` exposes three functions:

```ts
checkLimit(clubId, "maxMembers")    // → { ok: boolean, reason?, upgrade? }
checkFeature(clubId, "advancedAnalytics")  // → { ok: boolean, upgrade? }
getFullUsage(clubId)                // → { usage: {}, limits: {} }
```

**Limits enforced at write time (not read time):**
- `maxMembers` — checked on `POST /api/admin/members` + member self-register
- `maxCoaches` — checked on `POST /api/admin/coaches`
- `maxAdmins` — checked on `POST /api/admin/staff`
- `maxBookingsPerMonth` — checked on `POST /api/dashboard/bookings`

**Feature gates** (return 402 + `upgrade: true`):
- `advancedAnalytics` — `/api/admin/analytics`
- `revenueAnalytics` — analytics revenue endpoint

**Trial lifecycle:**
- Club created → `ClubSubscription.status = TRIALING`, `trialEndsAt = now + 14 days`
- Cron `/api/cron/trial-check` runs daily at 06:00 → sets `status = SUSPENDED` on expired trials
- Proxy: SUSPENDED clubs get `{ error: "Club suspendu" }` on all API calls

---

## Testing

```bash
# Run the whole suite
npx vitest run

# Run only new Phase 11 tests
npx vitest run app/api/__tests__/

# Run specific suite
npx vitest run app/api/__tests__/tenant-isolation.test.ts
```

### Test Suites

| Suite | File | Tests |
|---|---|---|
| Auth | `lib/__tests__/auth.test.ts` | JWT sign/verify, role guards |
| OTP | `lib/__tests__/otp.test.ts` | OTP generation + expiry |
| Permissions | `lib/__tests__/permissions.test.ts` | RBAC matrix |
| Rate limit | `lib/__tests__/rate-limit.test.ts` | Upstash sliding window |
| Validation | `lib/__tests__/validation.test.ts` | Zod schemas |
| **Tenant isolation** | `app/api/__tests__/tenant-isolation.test.ts` | Cross-club 403 + WHERE scope |
| **Plan limits** | `app/api/__tests__/plan-limits.test.ts` | 402 on limit hit, 201 below |
| **Webhook idempotency** | `app/api/__tests__/webhook-idempotency.test.ts` | No double-write on repeat call |
| **Onboarding E2E** | `app/api/__tests__/onboarding-e2e.test.ts` | Full club creation flow |

All tests mock Prisma at module level — no live DB required.

---

## Project Status — Phases 0–12

| Phase | Name | Status |
|---|---|---|
| 0 | Remise en route | ✅ 0 TS errors, 86/86 tests, 108 pages |
| 1–4 | Multi-tenancy foundation | ✅ All 72 API routes scoped by clubId |
| 5 | Dashboards | ✅ Owner / Admin / Coach / Member |
| 6 | Website Builder | ✅ Subdomain proxy + branding + page gates |
| 7 | Plan Limits | ✅ checkLimit/checkFeature on all write endpoints |
| 8 | Onboarding | ✅ 3-step wizard + atomic tx + auto-login |
| 9 | SaaS Billing | ✅ Trial cron + upgrade flow + billing page |
| 10 | Security + Performance | ✅ CSRF + rate limit (proxy) + indexes + logger |
| 11 | Tests | ✅ Tenant isolation + plan limits + webhook + onboarding |
| 12 | Production Readiness | ✅ /api/health + vercel.json + .env.example (Sentry: config stubs only — `@sentry/nextjs` not installed yet) |

### Known Tech Debt

| # | Issue | Priority |
|---|---|---|
| 1 | `/user/onboarding/page.tsx` (Google OAuth phone step) and `/onboarding/page.tsx` coexist — old one should be removed | Medium |
| 2 | `lib/auth-server.ts` may duplicate `lib/auth.ts` — audit and remove | Low |
| 3 | `app/login/page.tsx` duplicates `app/user/login/page.tsx` — consolidate | Low |
| 4 | `coaching/page.tsx` and `activites/*` are static — not yet connected to DB | Low |
| 5 | Sentry is not wired: `sentry.*.config.ts` are empty stubs and `@sentry/nextjs` isn't a dependency | Medium |
| 6 | Removed: SSE now uses Upstash Redis pub/sub (`lib/sse.ts`) with in-memory fallback when Redis isn't configured | — |

---

## Setup & Environment Variables

### Fastest path (Docker + one command)

```bash
git clone https://github.com/fedimezz/saasssss-club.git && cd saasssss-club
bash scripts/fresh-start.sh        # Postgres in Docker → .env → install → migrate → seed → dev server
```

Needs Node ≥ 20.9, Docker, and (on Windows) Git Bash or WSL. Flags: `--no-dev` (setup only), `--reset` (wipe the local DB first).

### Manual setup (your own Postgres)

```bash
npm ci                                  # also runs `prisma generate` (postinstall)
cp .env.example .env                    # Prisma reads `.env`, not `.env.local`; Next reads both
# edit .env: DATABASE_URL, DIRECT_URL, APP_URL, NEXT_PUBLIC_APP_URL, JWT_SECRET, CRON_SECRET
npx prisma migrate deploy               # apply tracked migrations
npx prisma db seed                      # 2 demo gyms, SaaS plans, demo accounts (password: Demo123!)
npm run dev
```

Open `http://club-a.localhost:3000` (gym A), `http://club-b.localhost:3000` (gym B) or `http://localhost:3000` (platform: landing, onboarding, `/platform/login`).
Demo logins: `owner.a@demo.local`, `admin.a@demo.local`, `coach.a@demo.local`, `member.a@demo.local`, `owner.b@demo.local`, `superadmin@platform.local` — all `Demo123!`.
Redis (Upstash), Brevo, Cloudinary and Konnect are optional locally: rate limiting falls back to in-memory and emails are printed to the terminal.

Useful scripts: `npm run validate` (lint + typecheck + tests), `npm run db:studio`, `npm run db:migrate:dev` (create a new migration).

### All Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection (Prisma runtime) |
| `DIRECT_URL` | ✅ | Direct connection for migrations (bypasses PgBouncer) |
| `APP_URL` | ✅ | Platform base URL, no trailing slash |
| `NEXT_PUBLIC_APP_URL` | ✅ | Same, exposed to browser |
| `JWT_SECRET` | ✅ | Min 32 chars. `openssl rand -base64 32` |
| `UPSTASH_REDIS_REST_URL` | ✅ | Upstash Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Upstash Redis token |
| `CLOUDINARY_CLOUD_NAME` | ✅ | Image upload |
| `CLOUDINARY_API_KEY` | ✅ | |
| `CLOUDINARY_API_SECRET` | ✅ | |
| `GOOGLE_CLIENT_ID` | Optional | OAuth |
| `GOOGLE_CLIENT_SECRET` | Optional | |
| `GOOGLE_REDIRECT_URI` | Optional | |
| `KONNECT_API_KEY` | ✅ | Payment gateway |
| `KONNECT_BASE_URL` | ✅ | |
| `KONNECT_WALLET_ID` | ✅ | |
| `BREVO_API_KEY` | ✅ prod | Transactional email via Brevo REST API (dev: emails are printed to the console if empty) |
| `SMTP_FROM` | ✅ | Verified sender address in Brevo |
| `TWILIO_ACCOUNT_SID` | Optional | SMS |
| `TWILIO_AUTH_TOKEN` | Optional | |
| `TWILIO_FROM_NUMBER` | Optional | |
| `CRON_SECRET` | ✅ | Auth header for Vercel Cron jobs (min 16 chars; unset ⇒ all cron calls rejected) |
| `SENTRY_DSN` | Optional | Error monitoring (server) |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Error monitoring (browser) |
| `DEV_DEFAULT_CLUB_SLUG` | Dev only | Leave unset. Makes plain `localhost` act as one gym, which breaks the super-admin login |
| `COOKIE_DOMAIN` | Optional | Leave empty (cookie scoped to the exact host). Only set to share a session across subdomains |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | Prod seed | Bootstraps the platform SUPER_ADMIN when running the seed with `NODE_ENV=production` (password 12+ chars) |
| `JSON_LOGS` | Optional | Force JSON log output in dev (`1` = enable) |
| `DEBUG` | Optional | Enable debug logs in production (`1` = enable) |

---

## Deployment (Vercel)

```bash
# Deploy
vercel --prod

# Required Vercel settings:
# 1. Wildcard domain: *.yoursaas.com → your Vercel project
# 2. Environment variables: copy all from .env.example
# 3. Cron jobs: defined in vercel.json (trial-check, subscription-renewal, session-reminders)
```

**Production database bootstrap (run from your machine or CI, pointing at the production DB — not during the Vercel build):**

```bash
export DATABASE_URL="postgresql://…"  DIRECT_URL="postgresql://…"   # DIRECT_URL = non-pooled connection
npx prisma migrate deploy                                            # apply tracked migrations (never `db push` / `migrate dev` in prod)

# Seeds ONLY the SaaS plan catalog (+ the platform super-admin if both vars are set).
# In production mode it never creates the demo clubs / demo accounts.
NODE_ENV=production SUPER_ADMIN_EMAIL="you@yourdomain.com" SUPER_ADMIN_PASSWORD="a-long-unique-password" npx prisma db seed
```

Required Vercel env vars before the first deploy: `DATABASE_URL`, `DIRECT_URL`, `APP_URL`, `NEXT_PUBLIC_APP_URL`, `JWT_SECRET` (32+ chars), `CRON_SECRET` (16+ chars), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `BREVO_API_KEY`, `SMTP_FROM`, `CLOUDINARY_*`, `KONNECT_*`.

**Wildcard domain setup:**
1. Vercel Dashboard → Project → Settings → Domains
2. Add `*.yoursaas.com` as a wildcard domain
3. Add DNS `CNAME *.yoursaas.com → cname.vercel-dns.com` at your registrar

**Post-deploy checklist:**
- [ ] `GET https://yoursaas.com/api/health` returns `{ "status": "ok" }`
- [ ] Create one club via `/onboarding` — check JWT cookie is set
- [ ] Verify subdomain routes to correct club data
- [ ] Trigger test payment through Konnect sandbox
- [ ] Check Vercel Cron logs after first scheduled run

---

## Key Files Reference

```
prisma/
  schema.prisma          Full schema — 824 lines, 19 models
  seed.ts                Demo seed: SaaS plans + 2 clubs + members + sessions
  migrations/            5 migration files (init → perf indexes)

lib/
  auth.ts                generateToken, verifyToken, requireX() guards, AuthResult type
  tenant.ts              resolveTenantFromRequest() — subdomain → clubId
  plan-limits.ts         checkLimit(), checkFeature(), getFullUsage()
  guards.ts              assertClubId() — type-narrows string|null → string
  logger.ts              Structured JSON logger, zero deps, PII-safe
  permissions.ts         Granular RBAC permission matrix
  rate-limit.ts          Upstash Redis sliding window rate limiter
  notify.ts              In-app + SSE notification helpers
  session-date.ts        DayOfWeek ↔ Date conversion utilities
  validation.ts          Shared Zod schemas
  csrf.ts                Origin verification for state-mutating requests
  payments/konnect.ts    Konnect API client (initiate, verify, webhook)

proxy.ts                 Edge middleware — slug injection + JWT + roles + rate limit + CSRF + logging

app/api/
  health/route.ts        DB + Redis liveness (public, no auth)
  onboarding/            Club creation (atomic tx)
  admin/                 All management routes (members, coaches, schedule…)
  dashboard/             Member + Coach personal routes
  billing/               SaaS plan status + upgrade
  platform/              Super-admin control plane
  cron/                  Trial expiry + subscription renewal + reminders
  payments/konnect/      Payment initiation + webhook
  posts/                 Club feed (announcements, likes, comments)
  sse/                   Server-Sent Events endpoint

sentry.client.config.ts  Browser Sentry (replay + tracing)
sentry.server.config.ts  Server Sentry (errors + PII scrub)
sentry.edge.config.ts    Edge Runtime Sentry
app/global-error.tsx     Global error boundary (App Router)
vercel.json              Crons + wildcard rewrite + security headers
.env.example             All variables documented
```
