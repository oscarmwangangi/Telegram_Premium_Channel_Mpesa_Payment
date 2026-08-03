import { env } from "@/config/env";
import { createApp } from "@/app";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { startBot } from "@/telegram/bot-client";
import { registerBotHandlers } from "@/telegram/bot";
import { registerCronJobs } from "@/jobs/scheduler";

async function main() {
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`Server listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  startBot();
  registerBotHandlers();
  registerCronJobs();

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      const { bot } = await import("@/telegram/bot-client");
      await bot.stopPolling();
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
// Converts all BigInt values to strings when serialized to JSON
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
main().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
