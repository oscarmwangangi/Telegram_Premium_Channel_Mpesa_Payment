import { prisma } from "@/lib/prisma";
import { subscriptionRepository } from "@/repositories/subscription.repository";
import { paymentRepository } from "@/repositories/payment.repository";
import { channelAccessRepository } from "@/repositories/channel-access.repository";
import { grantChannelAccess, revokeChannelAccess } from "@/telegram/channel-access.service";
import {
  sendPaymentConfirmationEmail,
  sendSubscriptionActivatedEmail,
  sendSubscriptionExpiredEmail,
} from "@/services/notification.service";
import { logger } from "@/lib/logger";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { Prisma } from "@prisma/client";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Activates a subscription after a payment has been confirmed successful
 * by the gateway (M-Pesa callback or PayPal capture). Runs inside a single
 * DB transaction so the payment record, the subscription record, and the
 * (future) email/telegram side effects are all triggered off one
 * consistent state change.
 *
 * Relies on the partial unique index `subscriptions_one_active_per_user`
 * as a last line of defense: if two callbacks somehow race past the
 * application-level check, Postgres itself rejects the second one.
 */
export async function activateSubscriptionForPayment(paymentId: string) {
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { plan: true },
    });

    if (!payment) throw new NotFoundError("Payment not found");
    if (payment.status === "SUCCESS" && payment.subscriptionId) {
      // Already processed by a previous (possibly retried) callback — no-op.
      logger.info({ paymentId }, "Payment already activated a subscription; skipping");
      const existing = await tx.subscription.findUnique({
        where: { id: payment.subscriptionId },
        include: { plan: true },
      });
      return { subscription: existing, user: await tx.user.findUnique({ where: { id: payment.userId } }), alreadyActivated: true };
    }

    // Reuse the existing PENDING subscription for this payment if one was
    // pre-created at checkout time; otherwise create one now.
    let subscription = payment.subscriptionId
      ? await tx.subscription.findUnique({ where: { id: payment.subscriptionId } })
      : null;

    if (!subscription) {
      subscription = await subscriptionRepository.createPending(
        { userId: payment.userId, planId: payment.planId },
        tx
      );
    }

    const now = new Date();
    const endDate = addDays(now, payment.plan.durationDays);

    try {
      const activated = await subscriptionRepository.activate(
        subscription.id,
        { startDate: now, endDate },
        tx
      );

      await paymentRepository.linkToSubscription(payment.id, activated.id, tx);
      await paymentRepository.markSuccess(payment.id, tx);

      const full = await tx.subscription.findUnique({
        where: { id: activated.id },
        include: { plan: true },
      });
      const user = await tx.user.findUnique({ where: { id: payment.userId } });

      return { subscription: full, user, alreadyActivated: false };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Unique constraint hit: user already has another ACTIVE subscription
        // (a genuine race between two payments). Do not silently drop the
        // money — surface it so support/admin can reconcile (e.g. extend
        // the existing subscription and refund/credit this payment).
        logger.error(
          { paymentId, userId: payment.userId },
          "Race detected: user already has an active subscription during activation"
        );
        throw new ConflictError(
          "User already has an active subscription; payment requires manual reconciliation.",
          { paymentId, userId: payment.userId }
        );
      }
      throw err;
    }
  });

  // Telegram API calls happen AFTER the transaction commits — they're slow,
  // external, and shouldn't hold a DB transaction open. If this fails, the
  // subscription is still correctly ACTIVE in the DB; the user can request
  // their invite link again via /start (see bot.ts), so nothing is lost.
  if (result.subscription && result.user) {
    try {
      await grantChannelAccess(result.user, result.subscription);
    } catch (err) {
      logger.error(
        { err, subscriptionId: result.subscription.id },
        "Subscription activated but granting Telegram channel access failed"
      );
    }

    // Only send activation-flow emails the first time this payment is
    // processed — a duplicate/retried callback (alreadyActivated: true)
    // must not re-send "your payment was confirmed" a second time.
    if (!result.alreadyActivated) {
      try {
        const payment = await prisma.payment.findUnique({
          where: { id: paymentId },
          include: { plan: true },
        });
        if (payment) {
          await sendPaymentConfirmationEmail(result.user, payment);
        }
        await sendSubscriptionActivatedEmail(result.user, result.subscription);
      } catch (err) {
        logger.error(
          { err, subscriptionId: result.subscription.id },
          "Subscription activated but sending confirmation emails failed"
        );
      }
    }
  }

  return result.subscription;
}

export async function extendSubscription(subscriptionId: string, additionalDays: number) {
  const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) throw new NotFoundError("Subscription not found");

  const base = subscription.endDate && subscription.endDate > new Date() ? subscription.endDate : new Date();
  return subscriptionRepository.extend(subscriptionId, addDays(base, additionalDays));
}

export async function cancelSubscription(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { user: true },
  });
  if (!subscription) throw new NotFoundError("Subscription not found");

  const cancelled = await subscriptionRepository.cancel(subscriptionId);

  const access = await channelAccessRepository.findActiveForSubscription(subscriptionId);
  if (access) {
    try {
      await revokeChannelAccess(access, subscription.user.telegramId);
    } catch (err) {
      logger.error({ err, subscriptionId }, "Failed to revoke Telegram access on cancellation");
    }
  }

  return cancelled;
}

/**
 * Called by the scheduled cron job (see src/jobs/expire-subscriptions.job.ts)
 * to flip anything past its endDate to EXPIRED, and synchronize Telegram
 * channel access accordingly. Centralizing this here keeps the "what counts
 * as expired" rule in one place, matching the read-side logic in
 * getSubscriptionStatus.
 */
export async function expirePastDueSubscriptions(): Promise<number> {
  const expired = await subscriptionRepository.findExpired(new Date());

  for (const sub of expired) {
    await subscriptionRepository.expire(sub.id);

    const access = await channelAccessRepository.findActiveForSubscription(sub.id);
    if (access) {
      try {
        await revokeChannelAccess(access, sub.user.telegramId);
      } catch (err) {
        logger.error(
          { err, subscriptionId: sub.id },
          "Failed to revoke Telegram channel access for expired subscription"
        );
      }
    }

    try {
      await sendSubscriptionExpiredEmail(sub.user, sub);
    } catch (err) {
      logger.error({ err, subscriptionId: sub.id }, "Failed to send subscription-expired email");
    }
  }

  return expired.length;
}
