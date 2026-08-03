# Database Schema

PostgreSQL + Prisma. Full schema: `backend/prisma/schema.prisma`.
Migrations: `backend/prisma/migrations/`.

## ER Diagram

```mermaid
erDiagram
    USER ||--o{ SUBSCRIPTION : has
    USER ||--o{ PAYMENT : makes
    USER ||--o{ TELEGRAM_CHANNEL_ACCESS : has
    USER ||--o{ EMAIL_NOTIFICATION : receives
    USER ||--o{ AUDIT_LOG : "is subject of"

    SUBSCRIPTION_PLAN ||--o{ SUBSCRIPTION : defines
    SUBSCRIPTION_PLAN ||--o{ PAYMENT : "paid for"

    SUBSCRIPTION ||--o{ PAYMENT : "funded by"
    SUBSCRIPTION ||--o{ TELEGRAM_CHANNEL_ACCESS : grants

    PAYMENT ||--o{ PAYMENT_TRANSACTION : "attempted via"

    ADMIN_USER ||--o{ ADMIN_SESSION : "logs in via"
    ADMIN_USER ||--o{ AUDIT_LOG : performs
    ADMIN_USER ||--o{ EMAIL_NOTIFICATION : "broadcasts (optional)"

    USER {
        uuid id PK
        bigint telegramId UK
        string telegramUsername
        string phoneNumber
        string email UK
        enum status "ACTIVE|SUSPENDED|BANNED"
    }

    ADMIN_USER {
        uuid id PK
        string email UK
        string passwordHash
        enum role "SUPER_ADMIN|ADMIN|SUPPORT"
        boolean isActive
    }

    ADMIN_SESSION {
        uuid id PK
        uuid adminUserId FK
        string refreshTokenHash UK
        timestamp expiresAt
        timestamp revokedAt
    }

    SUBSCRIPTION_PLAN {
        uuid id PK
        string code UK "MONTHLY|YEARLY"
        decimal priceUsd
        int durationDays
        boolean isActive
    }

    SUBSCRIPTION {
        uuid id PK
        uuid userId FK
        uuid planId FK
        enum status "PENDING|ACTIVE|EXPIRED|CANCELLED"
        timestamp startDate
        timestamp endDate
        boolean autoRenew
    }

    PAYMENT {
        uuid id PK
        uuid userId FK
        uuid subscriptionId FK "nullable"
        uuid planId FK
        enum method "MPESA|PAYPAL"
        decimal amount
        enum currency "KES|USD"
        decimal amountUsd
        enum status "PENDING|SUCCESS|FAILED|CANCELLED|TIMEOUT"
    }

    PAYMENT_TRANSACTION {
        uuid id PK
        uuid paymentId FK
        enum provider "MPESA|PAYPAL"
        string checkoutRequestId UK "mpesa"
        string mpesaReceiptNumber UK "mpesa"
        string paypalOrderId UK "paypal"
        json rawCallbackPayload
        enum status "PENDING|SUCCESS|FAILED"
    }

    TELEGRAM_CHANNEL_ACCESS {
        uuid id PK
        uuid userId FK
        uuid subscriptionId FK
        string channelId
        string inviteLink
        enum status "PENDING_INVITE|INVITED|JOINED|REVOKED|EXPIRED"
    }

    EMAIL_NOTIFICATION {
        uuid id PK
        uuid userId FK "nullable"
        enum type "WELCOME|PAYMENT_CONFIRMATION|..."
        enum status "QUEUED|SENT|FAILED"
        uuid sentByAdminId FK "nullable"
    }

    AUDIT_LOG {
        uuid id PK
        enum actorType "ADMIN|SYSTEM|USER"
        uuid adminUserId FK "nullable"
        uuid userId FK "nullable"
        string action
        string entityType
        string entityId
        json metadata
    }

    EXCHANGE_RATE_SNAPSHOT {
        uuid id PK
        enum baseCurrency
        enum targetCurrency
        decimal rate
        string source
        timestamp fetchedAt
    }
```

## Key Design Decisions

**Payment vs. PaymentTransaction split.** `Payment` is the business-level intent ("user X is paying for plan Y"). `PaymentTransaction` is the raw, provider-level record of a single gateway attempt — this is where idempotency lives. `checkoutRequestId`, `mpesaReceiptNumber`, and `paypalOrderId` are all unique at the DB level, so a retried M-Pesa callback or a duplicate PayPal webhook can never activate a subscription twice, no matter what the application code does. One `Payment` can have multiple `PaymentTransaction` rows if a user retries a failed checkout.

**One active subscription per user, enforced by Postgres.** Prisma's schema syntax doesn't support partial unique indexes directly, so this is added via raw SQL in the second migration:
```sql
CREATE UNIQUE INDEX "subscriptions_one_active_per_user"
    ON "subscriptions" ("userId") WHERE "status" = 'ACTIVE';
```
This closes the race condition present in the original prototype, where two concurrent payment callbacks could both "succeed" against the same in-memory object.

**Subscription lifecycle.** `PENDING` (created when checkout starts) → `ACTIVE` (on verified payment success) → `EXPIRED` (flipped by a scheduled job when `endDate` passes) or `CANCELLED` (admin/user action). `startDate`/`endDate` are only set on activation, not at creation — a `PENDING` subscription that never gets paid for has no dates and doesn't block a future attempt.

**Amounts stored in both original currency and USD.** M-Pesa charges in KES, PayPal in USD. `Payment.amount` + `Payment.currency` records what was actually charged; `Payment.amountUsd` is normalized for reporting/dashboards regardless of gateway. `exchangeRate` records what rate was used, sourced from `ExchangeRateSnapshot`, so historical reports stay accurate even if today's rate differs.

**Audit trail.** `AuditLog` is generic (`entityType` + `entityId` + `metadata` JSON) so it can log admin actions (suspend user, extend subscription), system actions (auto-expiry), and is queryable per-entity without a table per action type.

## Indexes & Constraints Summary

| Table | Constraint | Purpose |
|---|---|---|
| `subscriptions` | partial unique `(userId) WHERE status='ACTIVE'` | prevent duplicate active subscriptions |
| `subscriptions` | check `endDate > startDate` | data integrity |
| `payment_transactions` | unique `checkoutRequestId`, `mpesaReceiptNumber`, `paypalOrderId` | callback idempotency |
| `payments` | check `amount > 0`, `amountUsd > 0` | reject malformed/zero-amount records |
| `subscription_plans` | check `priceUsd > 0`, `durationDays > 0` | reject invalid plan config |
| `users` | unique `telegramId`, `email` | one account per Telegram user |
| `admin_sessions` | unique `refreshTokenHash` | session/refresh-token integrity |
| most FKs | `ON DELETE CASCADE` / `SET NULL` per relation semantics | see schema comments |
