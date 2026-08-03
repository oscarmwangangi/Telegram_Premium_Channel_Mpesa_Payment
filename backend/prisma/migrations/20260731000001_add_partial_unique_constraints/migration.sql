-- Enforce at the database level that a user can never have more than one
-- ACTIVE subscription simultaneously. This is deliberately NOT left to
-- application logic alone, since a race between two concurrent payment
-- callbacks activating two different PENDING subscriptions for the same
-- user must be impossible, not just "unlikely".
CREATE UNIQUE INDEX "subscriptions_one_active_per_user"
    ON "subscriptions" ("userId")
    WHERE "status" = 'ACTIVE';

-- Guard against zero/negative amounts ever being persisted.
ALTER TABLE "payments"
    ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "payments"
    ADD CONSTRAINT "payments_amountUsd_positive" CHECK ("amountUsd" > 0);

-- endDate must be after startDate whenever both are set.
ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_end_after_start"
    CHECK ("endDate" IS NULL OR "startDate" IS NULL OR "endDate" > "startDate");

-- durationDays and priceUsd on a plan must be positive.
ALTER TABLE "subscription_plans"
    ADD CONSTRAINT "subscription_plans_duration_positive" CHECK ("durationDays" > 0);
ALTER TABLE "subscription_plans"
    ADD CONSTRAINT "subscription_plans_price_positive" CHECK ("priceUsd" > 0);
