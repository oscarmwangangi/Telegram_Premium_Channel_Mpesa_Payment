import TelegramBot from "node-telegram-bot-api";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

// Polling mode is used here for simplicity/portability (works without a
// public HTTPS endpoint, unlike webhook mode). For higher-throughput
// production deployments, swap `polling: true` for a webhook
// (bot.setWebHook + an Express route) — the handlers in bot.ts don't need
// to change either way since they're wired via bot.on(...).
export const bot = new TelegramBot(env.BOT_TOKEN, { polling: true });

bot.on("polling_error", (err) => {
  logger.error({ err }, "Telegram polling error");
});

export function startBot() {
  logger.info("Telegram bot started (polling mode)");
}
