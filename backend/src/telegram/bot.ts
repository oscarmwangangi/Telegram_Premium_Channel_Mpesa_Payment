import { bot } from "@/telegram/bot-client";
import { recordChannelJoin } from "@/telegram/channel-access.service";
import { userRepository } from "@/repositories/user.repository";
import { subscriptionPlanRepository } from "@/repositories/subscription-plan.repository";
import { subscriptionRepository } from "@/repositories/subscription.repository";
import { getSubscriptionStatus } from "@/services/subscription-status.service";
import { startCheckout } from "@/services/payment.service";
import { sendWelcomeEmail } from "@/services/notification.service";
import { normalizePhoneNumber } from "@/utils/phone";
import { AppError } from "@/lib/errors";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

// In-memory conversation state per Telegram chat, tracking which plan/method
// the user picked so the next free-text message (their phone number) can be
// routed correctly. This is UI flow state only — nothing financial is ever
// held only in memory; every payment attempt is persisted via
// payment.service the moment checkout starts.
const pendingPhoneEntry = new Map<number, { planCode: string }>();

function currency(amountUsd: number) {
  return `$${amountUsd}`;
}

async function sendMainMenu(chatId: number, telegramId: bigint) {
  const user = await userRepository.findByTelegramId(telegramId);
  if (!user) return;

  const status = await getSubscriptionStatus(user.id);

  if (status.state === "ACTIVE") {
    return bot.sendMessage(
      chatId,
      `✅ You already have an active subscription (${status.subscription?.plan.name}), ` +
        `expiring in ${status.daysRemaining} day(s) on ${status.subscription?.endDate?.toDateString()}.\n\n` +
        `Use /invite if you need your channel invite link again.`
    );
  }

  if (status.state === "PENDING") {
    return bot.sendMessage(
      chatId,
      `⏳ You have a payment in progress for the ${status.subscription?.plan.name}. ` +
        `Please complete it, or wait a few minutes for it to time out before starting a new one.`
    );
  }

  const plans = await subscriptionPlanRepository.listActive();
  const label = status.state === "EXPIRED" ? "Your subscription has expired." : "Welcome!";

  return bot.sendMessage(chatId, `${label} Choose a plan to get access to ${env.CHANNEL_NAME}:`, {
    reply_markup: {
      inline_keyboard: plans.map((p) => [
        { text: `${p.name} — ${currency(Number(p.priceUsd))}`, callback_data: `plan:${p.code}` },
      ]),
    },
  });
}

export function registerBotHandlers() {
  bot.onText(/\/start/, async (msg) => {
    try {
      const chatId = msg.chat.id;
      const telegramId = BigInt(msg.from!.id);

      const existing = await userRepository.findByTelegramId(telegramId);
      const user = await userRepository.upsertByTelegramId({
        telegramId,
        telegramUsername: msg.from?.username ?? null,
        firstName: msg.from?.first_name ?? null,
        lastName: msg.from?.last_name ?? null,
      });

      if (!existing) {
        try {
          await sendWelcomeEmail(user); // no-op if user hasn't set an email — see /email command
        } catch (err) {
          logger.error({ err, userId: user.id }, "Failed to send welcome email");
        }
      }

      await sendMainMenu(chatId, telegramId);
    } catch (err) {
      logger.error({ err }, "Error handling /start");
    }
  });

  // Email is optional — the bot flow works entirely over Telegram without
  // one — but registering an address unlocks receipts, renewal reminders,
  // and expiry notices via email in addition to Telegram DMs.
  bot.onText(/\/email(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const address = match?.[1]?.trim();

    if (!address) {
      return bot.sendMessage(chatId, "Usage: /email you@example.com");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      return bot.sendMessage(chatId, "That doesn't look like a valid email address. Try again.");
    }

    const user = await userRepository.findByTelegramId(BigInt(msg.from!.id));
    if (!user) return bot.sendMessage(chatId, "Send /start first.");

    try {
      await userRepository.updateEmail(user.id, address.toLowerCase());
      return bot.sendMessage(chatId, `✅ Email saved: ${address}. You'll get receipts and reminders there too.`);
    } catch (err) {
      logger.error({ err, userId: user.id }, "Failed to update user email");
      return bot.sendMessage(
        chatId,
        "Couldn't save that email — it may already be in use on another account."
      );
    }
  });

  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    await sendMainMenu(chatId, BigInt(msg.from!.id));
  });

  bot.onText(/\/invite/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await userRepository.findByTelegramId(BigInt(msg.from!.id));
    if (!user) return bot.sendMessage(chatId, "Send /start first.");

    const status = await getSubscriptionStatus(user.id);
    if (status.state !== "ACTIVE" || !status.subscription) {
      return bot.sendMessage(chatId, "You don't have an active subscription. Use /start to subscribe.");
    }

    // Re-triggering grantChannelAccess would require importing it here; to
    // keep this a read path, we just point the user to /start which will
    // reuse their existing active-state message. A dedicated "resend
    // invite" action can call channel-access.service directly if desired.
    return bot.sendMessage(
      chatId,
      "If you didn't receive your invite link or it expired, contact support — we'll issue a new one."
    );
  });

  // Plan selection
  bot.on("callback_query", async (query) => {
    if (!query.data || !query.message) return;
    const chatId = query.message.chat.id;
    const telegramId = BigInt(query.from.id);

    try {
      if (query.data.startsWith("plan:")) {
        const planCode = query.data.split(":")[1]!;
        await bot.sendMessage(chatId, "How would you like to pay?", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "📱 M-Pesa", callback_data: `pay:MPESA:${planCode}` }],
              [{ text: "💳 PayPal", callback_data: `pay:PAYPAL:${planCode}` }],
            ],
          },
        });
      } else if (query.data.startsWith("pay:")) {
        const [, method, planCode] = query.data.split(":") as [string, "MPESA" | "PAYPAL", string];

        if (method === "MPESA") {
          pendingPhoneEntry.set(chatId, { planCode });
          await bot.sendMessage(chatId, "Enter your M-Pesa phone number (e.g. 07XXXXXXXX):");
        } else {
          const result = await startCheckout({ telegramId, planCode, method: "PAYPAL" });
          const approveUrl = (result as { approveUrl?: string }).approveUrl;
          await bot.sendMessage(
            chatId,
            approveUrl
              ? `Complete your payment here:\n${approveUrl}`
              : "Could not start PayPal checkout. Please try again."
          );
        }
      }
      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      await bot.answerCallbackQuery(query.id);
      await handleFlowError(chatId, err);
    }
  });

  // Free-text messages — used only for phone number entry during M-Pesa checkout
  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    const chatId = msg.chat.id;
    const telegramId = BigInt(msg.from!.id);

    const pending = pendingPhoneEntry.get(chatId);
    if (!pending) return; // not in a phone-entry flow; ignore

    try {
      normalizePhoneNumber(msg.text); // validates before calling the service too
      await startCheckout({
        telegramId,
        planCode: pending.planCode,
        method: "MPESA",
        phoneNumber: msg.text,
      });
      pendingPhoneEntry.delete(chatId);
      await bot.sendMessage(chatId, "📲 STK push sent — check your phone and enter your M-Pesa PIN to complete payment.");
    } catch (err) {
      await handleFlowError(chatId, err);
    }
  });

  // Fires when the bot observes membership changes in the channel it admins
  // (requires the bot to be a channel admin with "can_invite_users" and
  // the channel's privacy settings to surface these updates).
  bot.on("chat_member", async (update) => {
    try {
      if (String(update.chat.id) !== env.CHANNEL_ID) return;
      const newStatus = update.new_chat_member.status;
      if (newStatus !== "member") return;

      const telegramId = BigInt(update.new_chat_member.user.id);
      const user = await userRepository.findByTelegramId(telegramId);
      if (!user) return;

      const activeSub = await subscriptionRepository.findActiveForUser(user.id);
      if (!activeSub) return;

      await recordChannelJoin(user.id, activeSub.id);
    } catch (err) {
      logger.error({ err }, "Error handling chat_member update");
    }
  });

  logger.info("Telegram bot handlers registered");
}

async function handleFlowError(chatId: number, err: unknown) {
  if (err instanceof AppError) {
    return bot.sendMessage(chatId, `⚠️ ${err.message}`);
  }
  logger.error({ err }, "Unhandled error in bot flow");
  return bot.sendMessage(chatId, "Something went wrong. Please try again in a moment.");
}
