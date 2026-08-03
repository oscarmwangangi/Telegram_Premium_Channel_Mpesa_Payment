import { env } from "@/config/env";
import type { Payment, Subscription, SubscriptionPlan, User } from "@prisma/client";

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#0f172a;padding:20px 24px;">
                <span style="color:#ffffff;font-size:18px;font-weight:bold;">${env.CHANNEL_NAME}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;color:#1f2937;font-size:14px;line-height:1.6;">
                <h2 style="margin:0 0 12px;color:#0f172a;">${title}</h2>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f9fafb;color:#9ca3af;font-size:12px;">
                You're receiving this because you have an account with ${env.CHANNEL_NAME}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function greeting(user: User): string {
  return user.firstName ? `Hi ${user.firstName},` : "Hi there,";
}

export function welcome(user: User) {
  return {
    subject: `Welcome to ${env.CHANNEL_NAME}`,
    html: shell(
      "Welcome!",
      `<p>${greeting(user)}</p><p>Thanks for connecting with ${env.CHANNEL_NAME} on Telegram. When you're ready, send /start to the bot to see subscription plans and get access.</p>`
    ),
  };
}

export function paymentConfirmation(user: User, payment: Payment & { plan: SubscriptionPlan }) {
  return {
    subject: "Payment received",
    html: shell(
      "Payment Confirmed",
      `<p>${greeting(user)}</p>
       <p>We've received your payment for the <strong>${payment.plan.name}</strong>.</p>
       <table style="width:100%;margin:12px 0;border-collapse:collapse;">
         <tr><td style="padding:4px 0;color:#6b7280;">Amount</td><td style="padding:4px 0;text-align:right;">${payment.amount} ${payment.currency}</td></tr>
         <tr><td style="padding:4px 0;color:#6b7280;">Method</td><td style="padding:4px 0;text-align:right;">${payment.method}</td></tr>
         <tr><td style="padding:4px 0;color:#6b7280;">Date</td><td style="padding:4px 0;text-align:right;">${(payment.completedAt ?? new Date()).toDateString()}</td></tr>
       </table>
       <p>Your channel invite link is on its way via Telegram.</p>`
    ),
  };
}

export function subscriptionActivated(user: User, subscription: Subscription & { plan: SubscriptionPlan }) {
  return {
    subject: `Your ${subscription.plan.name} is active`,
    html: shell(
      "Subscription Activated",
      `<p>${greeting(user)}</p>
       <p>Your <strong>${subscription.plan.name}</strong> is now active and valid until <strong>${subscription.endDate?.toDateString()}</strong>.</p>
       <p>Check your Telegram DMs for your channel invite link if you haven't already joined.</p>`
    ),
  };
}

export function renewalReminder(
  user: User,
  subscription: Subscription & { plan: SubscriptionPlan },
  daysOut: number
) {
  return {
    subject:
      daysOut === 1
        ? "Your subscription expires tomorrow"
        : `Your subscription expires in ${daysOut} days`,
    html: shell(
      "Renewal Reminder",
      `<p>${greeting(user)}</p>
       <p>Your <strong>${subscription.plan.name}</strong> expires on <strong>${subscription.endDate?.toDateString()}</strong>.
       Renew before then to keep your access to ${env.CHANNEL_NAME} uninterrupted.</p>
       <p>Send /start to the bot to renew.</p>`
    ),
  };
}

export function subscriptionExpired(user: User, subscription: Subscription & { plan: SubscriptionPlan }) {
  return {
    subject: "Your subscription has expired",
    html: shell(
      "Subscription Expired",
      `<p>${greeting(user)}</p>
       <p>Your <strong>${subscription.plan.name}</strong> has expired and your access to ${env.CHANNEL_NAME} has been removed.</p>
       <p>Send /start to the bot any time to resubscribe.</p>`
    ),
  };
}

export function paymentFailed(user: User, payment: Payment & { plan: SubscriptionPlan }, reason: string) {
  return {
    subject: "Payment could not be completed",
    html: shell(
      "Payment Failed",
      `<p>${greeting(user)}</p>
       <p>Your payment of ${payment.amount} ${payment.currency} for the ${payment.plan.name} could not be completed.</p>
       <p style="color:#6b7280;">Reason: ${reason}</p>
       <p>No charge was made. You can try again any time via /start.</p>`
    ),
  };
}

export function receipt(user: User, payment: Payment & { plan: SubscriptionPlan }) {
  return {
    subject: `Receipt — ${payment.plan.name}`,
    html: shell(
      "Receipt",
      `<p>${greeting(user)}</p>
       <table style="width:100%;margin:12px 0;border-collapse:collapse;">
         <tr><td style="padding:4px 0;color:#6b7280;">Transaction</td><td style="padding:4px 0;text-align:right;">${payment.id}</td></tr>
         <tr><td style="padding:4px 0;color:#6b7280;">Plan</td><td style="padding:4px 0;text-align:right;">${payment.plan.name}</td></tr>
         <tr><td style="padding:4px 0;color:#6b7280;">Amount</td><td style="padding:4px 0;text-align:right;">${payment.amount} ${payment.currency}</td></tr>
         <tr><td style="padding:4px 0;color:#6b7280;">Method</td><td style="padding:4px 0;text-align:right;">${payment.method}</td></tr>
         <tr><td style="padding:4px 0;color:#6b7280;">Date</td><td style="padding:4px 0;text-align:right;">${(payment.completedAt ?? new Date()).toDateString()}</td></tr>
       </table>
       <p>Keep this email for your records.</p>`
    ),
  };
}

export function announcement(user: User, bodyHtml: string) {
  return { html: shell("", `<p>${greeting(user)}</p>${bodyHtml}`) };
}
