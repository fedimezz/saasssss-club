# Club

Membership management web app for a gym/club (bookings, membership plans,
payments, staff/admin panel, member reports). Built with Next.js (App
Router), Prisma/Postgres, and custom JWT-based auth.

## Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL via Prisma
- **Auth**: custom JWT (httpOnly cookie), not NextAuth/Auth.js
- **UI**: Tailwind CSS, Radix UI primitives
- **Payments**: Konnect Network (Tunisian payment gateway)
- **Email**: SMTP via Nodemailer (falls back to console logging in dev)

## Getting started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Then fill in `.env` — see `.env.example` for what each variable is for
   and which ones are required vs. optional. At minimum you need
   `DATABASE_URL`, `DIRECT_URL`, and `JWT_SECRET` to run the app at all.

3. **Set up the database**

   This project uses tracked Prisma migrations (`prisma/migrations/`), not
   `db push`. For local development, against a fresh database:
   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```
   If you're changing the schema going forward, use
   `npx prisma migrate dev --name <what_changed>` — it generates a new
   migration file under `prisma/migrations/` from your `schema.prisma`
   edits and applies it, so the change has a reviewable diff and a way to
   reconstruct history. Don't hand-edit files under `prisma/migrations/`
   after they've been committed; if a mistake ships, fix it with a new
   forward migration rather than rewriting an already-applied one.
   `npx prisma migrate deploy` (no interactive prompts, doesn't generate new
   migrations) is what CI and production deploys should run.

4. **Run the dev server**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | ESLint |
| `npm test` | Run the unit test suite (Vitest) |

## Tests

`npm test` runs the unit test suite under `lib/__tests__/`. These currently
cover the pure, DB-independent logic: the rate limiter, OTP/token
generation and hashing, and the permission catalog. They intentionally
don't require a live database (the one test file that imports a
DB-touching module mocks the Prisma client out).

There is no integration/e2e test suite yet — most of the app's behavior
(auth flows, booking, payments, admin actions) is only exercised by manual
testing today. If you're extending this, consider adding integration tests
around the API routes (e.g. with a real test database) before it grows
much further.

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`:
- `lint-and-test`: ESLint + `npm test`
- `build`: spins up an ephemeral Postgres service, runs `prisma migrate
  deploy` against it, then does a full `next build`. This exists
  specifically so a schema/route mismatch (e.g. an API route referencing a
  Prisma model that was never added to `schema.prisma`) — or a schema edit
  that was never captured in a tracked migration — fails CI instead of
  shipping broken.

## Known limitations / things to know before relying on this in production

- **Rate limiting is distributed (Upstash Redis)**, backed by
  `@upstash/ratelimit` (`lib/rate-limit.ts`) — safe across multiple
  serverless instances. Requires `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN` to be set; without them, the auth endpoints
  that call it (login, register, reset-password, resend-code, verify) will
  error at request time.
- **Tracked Prisma migrations exist** under `prisma/migrations/` (confirmed
  to cover every table currently in `schema.prisma`, no drift) — CI now runs
  `prisma migrate deploy` against them instead of `prisma db push`, so a
  schema edit that isn't captured in a matching migration file fails CI
  instead of shipping silently. See step 3 above for the local workflow.
- **File uploads go to Cloudinary** (`app/api/upload/route.ts`), not local
  disk — this already persists correctly across deploys/restarts on
  serverless hosts. Requires `CLOUDINARY_CLOUD_NAME` /
  `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`.
- **Email (`lib/email.ts`, via Nodemailer/SMTP) and SMS (`lib/sms.ts`, via
  Twilio's REST API) are both implemented**, and both fall back to logging
  to the server console when their respective env vars aren't set — so
  auth flows (verification codes, password reset) and admin broadcast
  notifications work in local dev without real credentials, and send for
  real once `SMTP_URL` / `TWILIO_ACCOUNT_SID` + friends are configured.
- The daily session-reminder cron (`app/api/cron/session-reminders`) is
  wired up via `vercel.json` for Vercel Cron. If you deploy elsewhere,
  you'll need to trigger that endpoint yourself on a schedule (with the
  `CRON_SECRET` bearer token).
- No `Content-Security-Policy` header before this pass — added, see
  `next.config.ts`. It allows `'unsafe-inline'` for scripts because of the
  two small inline theme/language init scripts in `app/layout.tsx`; moving
  those to a nonce-based CSP would let you drop `'unsafe-inline'`, but that
  needs per-request header injection (e.g. from `proxy.ts`) rather
  than the static config used here.
- There is still no integration/e2e test suite (see "Tests" above) — auth
  flows, booking, payments, and admin actions are exercised by manual
  testing, not CI.
