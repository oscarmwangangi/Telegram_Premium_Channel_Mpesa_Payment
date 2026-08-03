-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'SUPPORT');
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED');
CREATE TYPE "PaymentMethod" AS ENUM ('MPESA', 'PAYPAL');
CREATE TYPE "Currency" AS ENUM ('KES', 'USD');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT');
CREATE TYPE "TransactionProvider" AS ENUM ('MPESA', 'PAYPAL');
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
CREATE TYPE "ChannelAccessStatus" AS ENUM ('PENDING_INVITE', 'INVITED', 'JOINED', 'REVOKED', 'EXPIRED');
CREATE TYPE "EmailType" AS ENUM ('WELCOME', 'PAYMENT_CONFIRMATION', 'SUBSCRIPTION_ACTIVATED', 'RENEWAL_REMINDER_7D', 'RENEWAL_REMINDER_1D', 'SUBSCRIPTION_EXPIRED', 'PAYMENT_FAILED', 'RECEIPT', 'ANNOUNCEMENT');
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');
CREATE TYPE "ActorType" AS ENUM ('ADMIN', 'SYSTEM', 'USER');

-- CreateTable: users
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "telegramUsername" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "phoneNumber" TEXT,
    "email" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_telegramId_key" ON "users"("telegramId");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_phoneNumber_idx" ON "users"("phoneNumber");
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateTable: admin_users
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'SUPPORT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateTable: admin_sessions
CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_sessions_refreshTokenHash_key" ON "admin_sessions"("refreshTokenHash");
CREATE INDEX "admin_sessions_adminUserId_idx" ON "admin_sessions"("adminUserId");

-- CreateTable: subscription_plans
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceUsd" DECIMAL(10,2) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateTable: subscriptions
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "subscriptions_userId_idx" ON "subscriptions"("userId");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");
CREATE INDEX "subscriptions_endDate_idx" ON "subscriptions"("endDate");

-- CreateTable: payments
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "planId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "exchangeRate" DECIMAL(12,6),
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payments_userId_idx" ON "payments"("userId");
CREATE INDEX "payments_status_idx" ON "payments"("status");
CREATE INDEX "payments_method_idx" ON "payments"("method");
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");

-- CreateTable: payment_transactions
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "provider" "TransactionProvider" NOT NULL,
    "merchantRequestId" TEXT,
    "checkoutRequestId" TEXT,
    "mpesaReceiptNumber" TEXT,
    "paypalOrderId" TEXT,
    "paypalPayerId" TEXT,
    "rawRequestPayload" JSONB,
    "rawCallbackPayload" JSONB,
    "resultCode" INTEGER,
    "resultDesc" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_transactions_checkoutRequestId_key" ON "payment_transactions"("checkoutRequestId");
CREATE UNIQUE INDEX "payment_transactions_mpesaReceiptNumber_key" ON "payment_transactions"("mpesaReceiptNumber");
CREATE UNIQUE INDEX "payment_transactions_paypalOrderId_key" ON "payment_transactions"("paypalOrderId");
CREATE INDEX "payment_transactions_paymentId_idx" ON "payment_transactions"("paymentId");
CREATE INDEX "payment_transactions_provider_idx" ON "payment_transactions"("provider");

-- CreateTable: exchange_rate_snapshots
CREATE TABLE "exchange_rate_snapshots" (
    "id" TEXT NOT NULL,
    "baseCurrency" "Currency" NOT NULL,
    "targetCurrency" "Currency" NOT NULL,
    "rate" DECIMAL(12,6) NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exchange_rate_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "exchange_rate_snapshots_baseCurrency_targetCurrency_fetche_idx" ON "exchange_rate_snapshots"("baseCurrency", "targetCurrency", "fetchedAt");

-- CreateTable: telegram_channel_access
CREATE TABLE "telegram_channel_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "inviteLink" TEXT,
    "inviteLinkExpiresAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "status" "ChannelAccessStatus" NOT NULL DEFAULT 'PENDING_INVITE',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telegram_channel_access_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "telegram_channel_access_userId_idx" ON "telegram_channel_access"("userId");
CREATE INDEX "telegram_channel_access_subscriptionId_idx" ON "telegram_channel_access"("subscriptionId");
CREATE INDEX "telegram_channel_access_status_idx" ON "telegram_channel_access"("status");

-- CreateTable: email_notifications
CREATE TABLE "email_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "EmailType" NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,
    "sentByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "email_notifications_userId_idx" ON "email_notifications"("userId");
CREATE INDEX "email_notifications_type_idx" ON "email_notifications"("type");
CREATE INDEX "email_notifications_status_idx" ON "email_notifications"("status");

-- CreateTable: audit_logs
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "adminUserId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_channel_access" ADD CONSTRAINT "telegram_channel_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_channel_access" ADD CONSTRAINT "telegram_channel_access_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_notifications" ADD CONSTRAINT "email_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_notifications" ADD CONSTRAINT "email_notifications_sentByAdminId_fkey" FOREIGN KEY ("sentByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
