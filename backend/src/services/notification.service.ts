import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/services/email.service";
import { logger } from "@/lib/logger";
import * as templates from "@/templates/email.templates";
import type { Payment, Subscription, SubscriptionPlan, User } from "@prisma/client";

// The Telegram bot flow never requires an email address (users interact
// entirely via Telegram), so email is optional and captured only via the
// bot's /email command. Every function below is a graceful no-op if the
// user hasn't provided one, rather than treating it as an error — Telegram
// DMs remain the primary channel; email is a supplementary nice-to-have.
function hasEmail(user: User): user is User & { email: string } {
  if (!user.email) {
    logger.debug({ userId: user.id }, "Skipping email notification — no email on file");
    return false;
  }
  return true;
}

export async function sendWelcomeEmail(user: User) {
  if (!hasEmail(user)) return;
  const { subject, html } = templates.welcome(user);
  await sendEmail({ userId: user.id, type: "WELCOME", to: user.email, subject, html });
}

export async function sendPaymentConfirmationEmail(
  user: User,
  payment: Payment & { plan: SubscriptionPlan }
) {
  if (!hasEmail(user)) return;
  const { subject, html } = templates.paymentConfirmation(user, payment);
  await sendEmail({
    userId: user.id,
    type: "PAYMENT_CONFIRMATION",
    to: user.email,
    subject,
    html,
    metadata: { paymentId: payment.id },
  });
}

export async function sendSubscriptionActivatedEmail(
  user: User,
  subscription: Subscription & { plan: SubscriptionPlan }
) {
  if (!hasEmail(user)) return;
  const { subject, html } = templates.subscriptionActivated(user, subscription);
  await sendEmail({
    userId: user.id,
    type: "SUBSCRIPTION_ACTIVATED",
    to: user.email,
    subject,
    html,
    metadata: { subscriptionId: subscription.id },
  });
}

export async function sendRenewalReminderEmail(
  user: User,
  subscription: Subscription & { plan: SubscriptionPlan },
  daysOut: 7 | 1
) {
  if (!hasEmail(user)) return;
  const { subject, html } = templates.renewalReminder(user, subscription, daysOut);
  await sendEmail({
    userId: user.id,
    type: daysOut === 7 ? "RENEWAL_REMINDER_7D" : "RENEWAL_REMINDER_1D",
    to: user.email,
    subject,
    html,
    metadata: { subscriptionId: subscription.id },
  });
}

export async function sendSubscriptionExpiredEmail(
  user: User,
  subscription: Subscription & { plan: SubscriptionPlan }
) {
  if (!hasEmail(user)) return;
  const { subject, html } = templates.subscriptionExpired(user, subscription);
  await sendEmail({
    userId: user.id,
    type: "SUBSCRIPTION_EXPIRED",
    to: user.email,
    subject,
    html,
    metadata: { subscriptionId: subscription.id },
  });
}

export async function sendPaymentFailedEmail(
  user: User,
  payment: Payment & { plan: SubscriptionPlan },
  reason: string
) {
  if (!hasEmail(user)) return;
  const { subject, html } = templates.paymentFailed(user, payment, reason);
  await sendEmail({
    userId: user.id,
    type: "PAYMENT_FAILED",
    to: user.email,
    subject,
    html,
    metadata: { paymentId: payment.id },
  });
}

export async function sendReceiptEmail(user: User, payment: Payment & { plan: SubscriptionPlan }) {
  if (!hasEmail(user)) return;
  const { subject, html } = templates.receipt(user, payment);
  await sendEmail({
    userId: user.id,
    type: "RECEIPT",
    to: user.email,
    subject,
    html,
    metadata: { paymentId: payment.id },
  });
}

/**
 * Admin-triggered broadcast to every user with an email on file who
 * currently has an ACTIVE subscription. Returns how many were queued.
 */
export async function broadcastAnnouncement(params: {
  subject: string;
  bodyHtml: string;
  sentByAdminId: string;
}): Promise<number> {
  const recipients = await prisma.user.findMany({
    where: { email: { not: null }, subscriptions: { some: { status: "ACTIVE" } } },
  });

  let count = 0;
  for (const user of recipients) {
    if (!hasEmail(user)) continue;
    const { html } = templates.announcement(user, params.bodyHtml);
    const sent = await sendEmail({
      userId: user.id,
      type: "ANNOUNCEMENT",
      to: user.email,
      subject: params.subject,
      html,
      sentByAdminId: params.sentByAdminId,
    });
    if (sent) count++;
  }

  return count;
}
