# Premium Telegram Channel — Subscription Platform

A subscription-gated access system for a premium Telegram channel, with M-Pesa and PayPal
payments, automated Telegram invite/revoke, email notifications, and an admin ops console.

This is a full rebuild of an earlier ~160-line prototype (single-file Express + Telegram bot,
no database, no admin tooling). See [`docs/audit.md`](docs/audit.md)-equivalent notes in the
project history for what was wrong with it — this README documents the system as rebuilt.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Folder structure](#folder-structure)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [PostgreSQL setup](#postgresql-setup)
- [Prisma migrations](#prisma-migrations)
- [Running locally](#running-locally)
- [Payment configuration](#payment-configuration)
- [Telegram bot configuration](#telegram-bot-configuration)
- [Exchange rate API configuration](#exchange-rate-api-configuration)
- [Email configuration](#email-configuration)
- [API documentation](#api-documentation)
- [Deployment guide](#deployment-guide)
- [Troubleshooting](#troubleshooting)
- [Future improvements](#future-improvements)

---

## Features

- **Two subscription plans**: Monthly ($3 / 30 days), Yearly ($13 / 365 days)
- **Dual payment methods**: M-Pesa STK Push (Daraja) and PayPal, user's choice at checkout
- **Idempotent payment processing**: every gateway callback is matched by a unique provider
  reference (`CheckoutRequestID`, PayPal order id), not by phone number or trust in the payload
- **One active subscription per user**, enforced at the Postgres level via a partial unique index
- **Centralized subscription-status logic** — a single function answers "does this user have
  access right now" for the bot, the API, and the cron jobs alike, so a user is never asked to
  pay twice while active
- **Automatic Telegram access control** — invite link issued on payment success, access revoked
  automatically when a subscription expires or is cancelled
- **Email notifications** (optional per-user) — welcome, payment confirmation, subscription
  activated, 7-day/1-day renewal reminders, expired, payment failed, receipt, admin broadcasts
- **Admin ops console** (React) — dashboard stats, user management, subscription management,
  payment management with CSV export, plan management, announcement broadcasts
- **JWT auth with rotating refresh tokens**, RBAC (`SUPER_ADMIN` / `ADMIN` / `SUPPORT`), audit log
  of every admin action

---

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict mode, both backend and frontend) |
| Backend runtime | Node.js + Express |
| ORM / Database | Prisma + PostgreSQL |
| Validation | Zod |
| Auth | JWT access tokens + rotating opaque refresh tokens, httpOnly cookies, argon2id password hashing |
| Payments | Safaricom Daraja (M-Pesa STK Push), PayPal REST API v2 |
| Telegram | `node-telegram-bot-api` |
| Email | Nodemailer (any SMTP provider) |
| Scheduling | `node-cron` |
| Logging | Pino |
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + React Router |

---

## Folder structure

```
telegram-subscription-platform/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts                 # seeds MONTHLY/YEARLY plans + bootstrap SUPER_ADMIN
│   │   └── migrations/
│   └── src/
│       ├── config/env.ts           # Zod-validated env, fails fast on missing vars
│       ├── lib/                    # prisma client, logger, jwt, errors, http response envelope
│       ├── utils/                  # phone normalization, cookies, password hashing, async handler
│       ├── repositories/           # thin Prisma data-access layer, one per aggregate
│       ├── services/               # business logic (see "Architecture" below)
│       ├── telegram/               # bot client, conversation handlers, channel access service
│       ├── templates/              # HTML email templates
│       ├── jobs/                   # cron jobs (expiry sweep, renewal reminders) + scheduler
│       ├── middleware/             # auth, RBAC, rate limiting, validation, error handling
│       ├── controllers/            # thin HTTP handlers (incl. controllers/admin/*)
│       ├── routes/                 # Express routers (incl. routes/admin/*)
│       ├── app.ts                  # Express app assembly (helmet, cors, rate limit, routes)
│       └── server.ts               # entrypoint — starts HTTP server, bot, cron
├── frontend/
│   └── src/
│       ├── lib/api.ts              # fetch client matching the backend's response envelope
│       ├── context/AuthContext.tsx
│       ├── components/             # Sidebar, Layout, StatCard, StatusPill, Pagination, etc.
│       └── pages/                  # Login, Dashboard, Users, Subscriptions, Payments, Plans, Announcements
└── docs/
    └── database-schema.md          # ER diagram + schema design rationale
```

### Architecture notes

- **Repositories** never contain business logic — they're Prisma queries and nothing else.
- **Services** hold all business logic. The most important one is
  `services/subscription-status.service.ts` — every surface (Telegram bot, public API, cron
  jobs) calls through `getSubscriptionStatus()` / `assertCanStartCheckout()` rather than
  re-implementing "is this user active" logic in multiple places.
- **`services/subscription-lifecycle.service.ts`** owns activation, extension, cancellation, and
  expiry. Activation runs inside one DB transaction and is idempotent — a retried gateway
  callback is a safe no-op, not a duplicate charge or duplicate Telegram invite.
- **Controllers** are thin: parse input with Zod, call a service, return via the shared
  `ok()`/`created()`/`fail()` response helpers.

---

## Installation

Requires **Node.js ≥ 20** and a **PostgreSQL** instance (local, Docker, or hosted).

```bash
git clone <your-repo-url>
cd telegram-subscription-platform

# Backend
cd backend
npm install
cp .env.example .env      # fill in real values — see below
npx prisma generate

# Frontend
cd ../frontend
npm install
cp .env.example .env
```

---

## Environment variables

All backend env vars are validated at startup via Zod (`src/config/env.ts`) — the server refuses
to start with a clear error message if anything required is missing or malformed, rather than
failing confusingly at first use.

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | no (default `development`) | `development` \| `production` \| `test` |
| `PORT` | no (default `3000`) | |
| `APP_BASE_URL` | yes | Public base URL of this API (used in PayPal return URLs) |
| `FRONTEND_URL` | no | Admin console origin, for CORS |
| `DATABASE_URL` | yes | Postgres connection string |
| `SHADOW_DATABASE_URL` | no | Needed only for `prisma migrate dev` locally |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | yes | ≥ 32 chars each, distinct values |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | no | default `15m` / `7d` |
| `COOKIE_DOMAIN` | no | default `localhost` |
| `BOT_TOKEN` | yes | from @BotFather |
| `CHANNEL_ID` | yes | numeric id of the private channel, e.g. `-1001234567890` |
| `CHANNEL_NAME` | no | display name used in bot/email copy |
| `MPESA_ENV` | no (default `sandbox`) | `sandbox` \| `production` |
| `MPESA_CONSUMER_KEY` / `_SECRET` / `_SHORTCODE` / `_PASSKEY` | yes | from Daraja portal |
| `MPESA_CALLBACK_URL` | yes | public HTTPS URL Safaricom will POST to |
| `PAYPAL_ENV` | no (default `sandbox`) | `sandbox` \| `live` |
| `PAYPAL_CLIENT_ID` / `_CLIENT_SECRET` / `_WEBHOOK_ID` | yes | from PayPal developer dashboard |
| `EXCHANGE_RATE_API_URL` | yes | any API returning `{ rates: { KES: number } }` for base USD |
| `EXCHANGE_RATE_CACHE_TTL_MINUTES` | no (default `60`) | |
| `SMTP_HOST` / `_PORT` / `_SECURE` / `_USER` / `_PASSWORD` | yes | any SMTP provider |
| `EMAIL_FROM` | yes | e.g. `"Premium Channel <no-reply@yourdomain.com>"` |
| `RATE_LIMIT_WINDOW_MINUTES` / `_MAX_REQUESTS` | no | general API rate limit |
| `CORS_ALLOWED_ORIGINS` | no | comma-separated list, e.g. admin console origin |
| `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` | only for seeding | used once by `prisma/seed.ts` to bootstrap the first SUPER_ADMIN — never hardcoded |

Frontend (`frontend/.env`):

| Variable | Notes |
|---|---|
| `VITE_API_URL` | Backend API base, e.g. `http://localhost:3000/api` |

---

## PostgreSQL setup

Any Postgres ≥ 14 works. Quickest local option with Docker:

```bash
docker run --name tsp-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=telegram_subscriptions \
  -p 5432:5432 -d postgres:16
```

Then set in `backend/.env`:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/telegram_subscriptions?schema=public"
```

---

## Prisma migrations

Migrations are already written (`backend/prisma/migrations/`) — you don't need to author them,
just apply them:

```bash
cd backend
npx prisma migrate deploy     # applies existing migrations, safe for production
# or, if you plan to modify the schema further during development:
npx prisma migrate dev

npx prisma db seed            # seeds MONTHLY/YEARLY plans + bootstrap SUPER_ADMIN
```

The seed script only creates a SUPER_ADMIN if `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` are set in
`.env` — there is no default admin account baked into the codebase.

> **Note on this repository's history:** the migration SQL here was hand-authored rather than
> generated live, because the sandbox this project was built in blocks Prisma's engine-binary
> download (`binaries.prisma.sh`) at the network level. The schema and SQL were reviewed for
> correctness against the `schema.prisma` file, and `prisma migrate deploy`/`dev` will apply them
> normally on any machine with regular network access — there's nothing sandbox-specific baked
> into the migrations themselves.

---

## Running locally

```bash
# Terminal 1 — backend (API + Telegram bot polling + cron jobs, all in one process)
cd backend
npm run dev

# Terminal 2 — frontend admin console
cd frontend
npm run dev
```

- API: `http://localhost:3000/api`
- Admin console: `http://localhost:5173`
- Telegram bot: runs in polling mode, so no public URL is needed for the bot itself — only the
  M-Pesa callback needs to be publicly reachable (see below).

For local M-Pesa callback testing, expose port 3000 with a tunnel (e.g. `ngrok http 3000`) and
set `MPESA_CALLBACK_URL` to the tunnel's HTTPS URL + `/api/payments/mpesa/callback`.

### Production build

```bash
cd backend && npm run build && npm start
cd frontend && npm run build   # outputs static files to frontend/dist — serve with any static host
```

---

## Payment configuration

### M-Pesa (Daraja)

1. Register at the [Safaricom Developer Portal](https://developer.safaricom.co.ke), create an app.
2. Grab the **Consumer Key**/**Consumer Secret** → `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET`.
3. Use the sandbox shortcode `174379` and its published passkey for testing, or your paybill/till
   shortcode + passkey in production → `MPESA_SHORTCODE` / `MPESA_PASSKEY`.
4. Set `MPESA_CALLBACK_URL` to a **public HTTPS** URL pointing at
   `POST /api/payments/mpesa/callback`. Safaricom will retry this callback on timeout — the
   backend already handles duplicate/retried callbacks safely via the unique
   `CheckoutRequestID`/`MpesaReceiptNumber` constraints.
5. Switch `MPESA_ENV=production` and use real credentials to go live.

### PayPal

1. Create an app at the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications).
2. `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` from the app credentials.
3. Add a webhook subscribed to `CHECKOUT.ORDER.APPROVED` and `PAYMENT.CAPTURE.COMPLETED`, pointing
   at `POST /api/payments/paypal/webhook`. Copy the **Webhook ID** into `PAYPAL_WEBHOOK_ID` — every
   incoming webhook is signature-verified against this before being trusted.
4. Switch `PAYPAL_ENV=live` with production credentials to go live.

---

## Telegram bot configuration

1. Create a bot via [@BotFather](https://t.me/BotFather), copy the token into `BOT_TOKEN`.
2. Create your private channel, add the bot as an **admin** with at least:
   - "Invite users via link"
   - "Ban users" (required to remove members automatically when a subscription expires)
3. Get the channel's numeric id (e.g. via `@userinfobot` or by temporarily logging an update) and
   set `CHANNEL_ID` — it will look like `-1001234567890`.
4. The bot runs in **polling mode** by default (see `src/telegram/bot-client.ts`), so no public
   URL is required for the bot itself. For higher-throughput deployments, switch to webhook mode
   by calling `bot.setWebHook()` and adding an Express route — the handlers in `telegram/bot.ts`
   don't need to change.

**Bot commands**: `/start` (menu + plan selection), `/status` (subscription status), `/email
<address>` (optional — register an email for receipts/reminders in addition to Telegram DMs),
`/invite` (help if an invite link was missed/expired).

---

## Exchange rate API configuration

M-Pesa charges in KES; the plans are priced in USD. `EXCHANGE_RATE_API_URL` should point at any
API returning JSON shaped like `{ "rates": { "KES": 129.5, ... } }` for a USD base — for example
[exchangerate-api.com](https://www.exchangerate-api.com)'s free tier
(`https://api.exchangerate-api.com/v4/latest/USD`). Rates are cached in the
`ExchangeRateSnapshot` table for `EXCHANGE_RATE_CACHE_TTL_MINUTES` (default 60), and the last
known rate is reused as a fallback if the live API call fails, so a transient outage doesn't
block checkout.

---

## Email configuration

Any standard SMTP provider works (SES, SendGrid SMTP, Postmark, Mailgun, Gmail SMTP for testing).
Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM`.

Email is **optional per user** — the Telegram bot flow never requires an email address. Users
opt in via `/email <address>` in the bot. Every notification function skips gracefully (logs and
returns) if a user has no email on file, so nothing breaks for users who never register one.

Every send attempt (success or failure) is recorded in the `EmailNotification` table, so
deliverability issues are visible from the admin console rather than only in SMTP logs.

---

## API documentation

Base path: `/api`. All responses use a consistent envelope:

```json
{ "success": true, "data": { ... }, "meta": { "page": 1, "pageSize": 20, "totalItems": 42, "totalPages": 3 } }
{ "success": false, "error": { "code": "NOT_FOUND", "message": "..." } }
```

### Public

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/subscriptions/plans` | List active plans |
| GET | `/subscriptions/status/:telegramId` | Subscription status for a Telegram user |
| POST | `/payments/checkout` | Start checkout `{ telegramId, planCode, method, phoneNumber? }` |
| POST | `/payments/mpesa/callback` | Daraja STK callback (unauthenticated — validated internally) |
| POST | `/payments/paypal/capture` | Capture an approved PayPal order `{ orderId }` |
| POST | `/payments/paypal/webhook` | PayPal webhook (signature-verified) |

### Admin (cookie session via `/admin/auth/login`)

| Method | Path | Roles |
|---|---|---|
| POST | `/admin/auth/login` | — |
| POST | `/admin/auth/refresh` | any authenticated session |
| POST | `/admin/auth/logout` | any |
| GET | `/admin/auth/me` | any |
| GET | `/admin/dashboard/stats` | SUPER_ADMIN, ADMIN, SUPPORT |
| GET | `/admin/users` | SUPER_ADMIN, ADMIN, SUPPORT |
| GET | `/admin/users/:id` | SUPER_ADMIN, ADMIN, SUPPORT |
| PATCH | `/admin/users/:id/status` | SUPER_ADMIN, ADMIN |
| PATCH | `/admin/users/subscriptions/:subscriptionId/extend` | SUPER_ADMIN, ADMIN |
| PATCH | `/admin/users/subscriptions/:subscriptionId/cancel` | SUPER_ADMIN, ADMIN |
| GET | `/admin/subscriptions` | SUPER_ADMIN, ADMIN, SUPPORT |
| GET | `/admin/subscriptions/upcoming-renewals` | SUPER_ADMIN, ADMIN, SUPPORT |
| GET | `/admin/payments` | SUPER_ADMIN, ADMIN, SUPPORT |
| GET | `/admin/payments/export` | SUPER_ADMIN, ADMIN, SUPPORT (CSV) |
| POST | `/admin/payments/:paymentId/retry` | SUPER_ADMIN, ADMIN |
| GET | `/admin/plans` | SUPER_ADMIN, ADMIN, SUPPORT |
| POST | `/admin/plans` | SUPER_ADMIN only |
| PATCH | `/admin/plans/:id` | SUPER_ADMIN only |
| PATCH | `/admin/plans/:id/disable` | SUPER_ADMIN only |
| POST | `/admin/notifications/announcements` | SUPER_ADMIN, ADMIN |

Pagination query params: `page`, `pageSize` (max 100). Filtering: `status`, `method` (payments),
`status` (subscriptions/users), `query` (users, free-text search).

---

## Deployment guide

1. **Database**: provision managed Postgres (RDS, Supabase, Neon, etc.). Run
   `npx prisma migrate deploy` against it as part of your deploy step.
2. **Backend**: build with `npm run build`, run `node dist/server.js` behind a process manager
   (PM2, systemd, or a container orchestrator). Set all env vars from
   [Environment variables](#environment-variables) in your hosting platform's secret store —
   never commit `.env`.
3. **Public HTTPS endpoint required for**: `MPESA_CALLBACK_URL` and the PayPal webhook URL. The
   Telegram bot itself doesn't need one in polling mode.
4. **Frontend**: `npm run build` produces static files in `frontend/dist/` — deploy to any static
   host (Vercel, Netlify, S3+CloudFront, or served by the same reverse proxy as the API). Set
   `CORS_ALLOWED_ORIGINS` on the backend to the frontend's deployed origin.
5. **Cron jobs** run in-process via `node-cron` inside the same server process — no separate
   worker deployment is required, but if you scale the backend horizontally, run the scheduler
   in only one instance (e.g. gate `registerCronJobs()` behind an env flag on a designated
   instance) to avoid duplicate email sends.
6. **Reverse proxy / TLS**: terminate HTTPS at your load balancer or reverse proxy (nginx,
   Caddy, or your platform's built-in TLS) in front of the Node process.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Server exits immediately with a list of env errors | One or more required env vars missing/invalid — the error message lists exactly which |
| `prisma migrate deploy` fails to connect | Check `DATABASE_URL`, and that Postgres is reachable from where you're running the command |
| M-Pesa STK push succeeds but user never gets a Telegram invite | Check the bot is an admin of the channel with invite permissions; check server logs for `ExternalServiceError: Telegram` |
| M-Pesa callback never arrives | `MPESA_CALLBACK_URL` must be a public HTTPS URL Safaricom can reach — not `localhost` |
| PayPal webhook returns 400 | Signature verification failed — check `PAYPAL_WEBHOOK_ID` matches the webhook configured in the PayPal dashboard |
| User stuck in "payment in progress" (PENDING) forever | STK push likely timed out without a callback; there's currently no automatic PENDING→timeout sweep — see Future improvements |
| Emails never send | Check SMTP credentials; check `EmailNotification` rows for `status: FAILED` and `errorMessage` |
| Admin login works but every other request 401s | Cookies aren't being sent — check `CORS_ALLOWED_ORIGINS` includes the frontend's exact origin and the frontend fetch uses `credentials: "include"` (already the default in `frontend/src/lib/api.ts`) |
| `npx prisma generate` fails to download engine | Your network blocks `binaries.prisma.sh` — same issue encountered while building this project in a sandboxed environment; run it from a machine/CI with normal network access |

---

## Future improvements

- **PENDING payment timeout sweep** — a cron job to mark STK pushes that never received a
  callback within N minutes as `TIMEOUT`, so they stop blocking `assertCanStartCheckout`.
- **Refund/reconciliation tooling** — the system already detects and logs the rare race where
  two payments both try to activate a subscription for the same user (rejected at the DB level),
  but there's no admin UI yet for the manual reconciliation this requires.
- **Webhook-mode Telegram bot** for higher throughput instead of polling.
- **Horizontal scaling of cron jobs** — currently assumes a single backend instance runs the
  scheduler; a distributed lock (e.g. via Postgres advisory locks) would allow safely running
  cron on every instance.
- **Auto-renewal via saved payment methods** — `Subscription.autoRenew` exists in the schema but
  isn't wired to an automatic charge yet (both M-Pesa and PayPal here are one-off charges).
- **Structured API documentation** — an OpenAPI/Swagger spec generated from the Zod schemas,
  rather than the hand-written table above.
