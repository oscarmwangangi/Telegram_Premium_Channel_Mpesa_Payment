import cron from "node-cron";
import { logger } from "@/lib/logger";
import { runExpirySweep } from "@/jobs/expire-subscriptions.job";
import { runRenewalReminders } from "@/jobs/renewal-reminders.job";
import { cancelSubscriptionsJob } from "@/jobs/cancel-subscriptions.job";
export function registerCronJobs() {
  // Daily at 02:00 server time: flip past-due subscriptions to EXPIRED,
  // revoke Telegram channel access, send the expiry email.
  cron.schedule("0 2 * * *", () => {
    runExpirySweep().catch((err) => logger.error({ err }, "Scheduled expiry sweep failed"));
  });

  // Daily at 09:00 server time: send 7-day and 1-day renewal reminders.
  cron.schedule("0 9 * * *", () => {
    runRenewalReminders().catch((err) => logger.error({ err }, "Scheduled renewal reminders failed"));
  });

  logger.info("Cron jobs registered: expiry sweep (02:00 daily), renewal reminders (09:00 daily)");

  // Hourly: process cancelled subscriptions
  cron.schedule("0 * * * *", () => {
    cancelSubscriptionsJob().catch((err) => logger.error({ err }, "Scheduled cancel-subscriptions job failed"));
  });
}
