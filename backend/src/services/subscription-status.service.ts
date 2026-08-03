import { subscriptionRepository } from "@/repositories/subscription.repository";
import { ConflictError } from "@/lib/errors";
import type { Subscription, SubscriptionPlan } from "@prisma/client";

export type SubscriptionState = "ACTIVE" | "EXPIRED" | "PENDING" | "NEVER_SUBSCRIBED" | "CANCELLED";

export interface SubscriptionStatusResult {
  state: SubscriptionState;
  subscription: (Subscription & { plan: SubscriptionPlan }) | null;
  daysRemaining: number | null;
}

/**
 * This is the ONLY place in the codebase that should ever answer the
 * question "does this user currently have access?". The Telegram bot,
 * the public API, the admin dashboard, and the cron expiry job all call
 * through here rather than re-implementing the logic — see section 6 of
 * the spec ("This logic should be centralized so it is reused everywhere").
 */
export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatusResult> {
  const active = await subscriptionRepository.findActiveForUser(userId);

  if (active) {
    // Defensive check: even though a cron job flips ACTIVE -> EXPIRED on
    // schedule, never trust "ACTIVE" blindly if endDate has already passed
    // (e.g. the job hasn't run yet this cycle).
    if (active.endDate && active.endDate.getTime() < Date.now()) {
      return {
        state: "EXPIRED",
        subscription: active as Subscription & { plan: SubscriptionPlan },
        daysRemaining: 0,
      };
    }

    const daysRemaining = active.endDate
      ? Math.ceil((active.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      state: "ACTIVE",
      subscription: active as Subscription & { plan: SubscriptionPlan },
      daysRemaining,
    };
  }

  const pending = await subscriptionRepository.findPendingForUser(userId);
  if (pending) {
    return {
      state: "PENDING",
      subscription: pending as Subscription & { plan: SubscriptionPlan },
      daysRemaining: null,
    };
  }

  const latest = await subscriptionRepository.findLatestForUser(userId);
  if (latest) {
    return {
      state: latest.status === "CANCELLED" ? "CANCELLED" : "EXPIRED",
      subscription: latest as Subscription & { plan: SubscriptionPlan },
      daysRemaining: null,
    };
  }

  return { state: "NEVER_SUBSCRIBED", subscription: null, daysRemaining: null };
}

/**
 * Gatekeeper for starting a new checkout. This is what prevents a user
 * from ever being asked to pay again while they have an active
 * subscription, and what prevents a duplicate PENDING payment attempt
 * from being started while one is already in flight.
 */
export async function assertCanStartCheckout(userId: string): Promise<void> {
  const status = await getSubscriptionStatus(userId);

  if (status.state === "ACTIVE") {
    throw new ConflictError(
      `You already have an active subscription until ${status.subscription?.endDate?.toDateString()}.`,
      { state: status.state, endDate: status.subscription?.endDate }
    );
  }

  if (status.state === "PENDING") {
    throw new ConflictError(
      "You already have a payment in progress. Please complete or wait for it to time out before starting a new one.",
      { state: status.state, subscriptionId: status.subscription?.id }
    );
  }
}
