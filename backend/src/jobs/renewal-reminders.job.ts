import { prisma } from "@/lib/prisma";
import { subscriptionRepository } from "@/repositories/subscription.repository";
import { sendRenewalReminderEmail } from "@/services/notification.service";
import { logger } from "@/lib/logger";
import type { EmailType } from "@prisma/client";

function dayWindow(daysFromNow: number): { start: Date; end: Date } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + daysFromNow);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/**
 * Reminders are deduplicated by checking EmailNotification for an existing
 * row of the same type tagged with this subscription's id in metadata —
 * this is what stops the job (which runs daily) from re-sending the same
 * "expires in 7 days" email every day of that week.
 */
async function alreadySent(userId: string, subscriptionId: string, type: EmailType): Promise<boolean> {
  const existing = await prisma.emailNotification.findFirst({
    where: {
      userId,
      type,
      metadata: { path: ["subscriptionId"], equals: subscriptionId },
    },
  });
  return Boolean(existing);
}

export async function runRenewalReminders(): Promise<number> {
  let sent = 0;

  const windows: Array<{ daysOut: 7 | 1; type: EmailType }> = [
    { daysOut: 7, type: "RENEWAL_REMINDER_7D" },
    { daysOut: 1, type: "RENEWAL_REMINDER_1D" },
  ];

  for (const { daysOut, type } of windows) {
    const { start, end } = dayWindow(daysOut);
    const subscriptions = await subscriptionRepository.findExpiringBetween(start, end);

    for (const subscription of subscriptions) {
      if (await alreadySent(subscription.userId, subscription.id, type)) continue;

      await sendRenewalReminderEmail(subscription.user, subscription, daysOut);
      sent++;
    }
  }

  if (sent > 0) {
    logger.info({ sent }, "Renewal reminder sweep complete");
  }
  return sent;
}
