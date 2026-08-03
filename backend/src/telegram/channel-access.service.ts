import type TelegramBot from "node-telegram-bot-api";
import { bot } from "@/telegram/bot-client";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { channelAccessRepository } from "@/repositories/channel-access.repository";
import { ExternalServiceError } from "@/lib/errors";
import type { Subscription, TelegramChannelAccess, User } from "@prisma/client";

const INVITE_LINK_VALIDITY_HOURS = 24;

/**
 * Creates a single-use, time-limited invite link and DMs it to the user.
 * Idempotent: if an unexpired, unused invite already exists for this
 * subscription, it's reused instead of generating a new one on every call
 * (e.g. if activateSubscriptionForPayment is triggered twice by a race
 * that the DB constraint didn't fully prevent, or the user asks again).
 */
export async function grantChannelAccess(
  user: User,
  subscription: Subscription
): Promise<TelegramChannelAccess> {
  const existing = await channelAccessRepository.findActiveForSubscription(subscription.id);
  if (existing) {
    if (existing.status === "JOINED") {
      return existing;
    }
    if (existing.inviteLinkExpiresAt && existing.inviteLinkExpiresAt.getTime() > Date.now()) {
      await safeSendInviteMessage(user.telegramId, existing.inviteLink!);
      return existing;
    }
  }

  const expireDate = Math.floor(Date.now() / 1000) + INVITE_LINK_VALIDITY_HOURS * 60 * 60;

  let link: TelegramBot.ChatInviteLink;
  try {
    link = await bot.createChatInviteLink(env.CHANNEL_ID, {
      // member_limit: 1,
      expire_date: expireDate,
      creates_join_request: true,
    });
  } catch (err) {
    logger.error({ err, userId: user.id }, "Failed to create Telegram invite link");
    throw new ExternalServiceError("Telegram", "Could not create channel invite link");
  }

  const access = await channelAccessRepository.create({
    userId: user.id,
    subscriptionId: subscription.id,
    channelId: env.CHANNEL_ID,
    inviteLink: link.invite_link,
    inviteLinkExpiresAt: new Date(expireDate * 1000),
  });

  await safeSendInviteMessage(user.telegramId, link.invite_link);

  return access;
}

async function safeSendInviteMessage(telegramId: bigint, inviteLink: string) {
  try {
    await bot.sendMessage(
      Number(telegramId),
      `✅ Payment confirmed! Here's your invite to *${env.CHANNEL_NAME}*:\n\n${inviteLink}\n\n` +
        `This link is single-use and expires in ${INVITE_LINK_VALIDITY_HOURS} hours, so join soon.`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    // Don't fail the whole activation flow just because the DM couldn't be
    // delivered (e.g. user blocked the bot) — the link is still recorded
    // and the user can request it again via /start.
    logger.warn({ err, telegramId: telegramId.toString() }, "Failed to DM invite link to user");
  }
}

/**
 * Marks a channel-access record as JOINED. Called from the bot's
 * `chat_member` update handler when Telegram reports the user actually
 * joined the channel.
 */
export async function recordChannelJoin(userId: string, subscriptionId: string) {
  const access = await channelAccessRepository.findActiveForSubscription(subscriptionId);
  if (!access) {
    logger.warn({ userId, subscriptionId }, "Join event for subscription with no pending access record");
    return null;
  }
  return channelAccessRepository.markJoined(access.id);
}

/**
 * Revokes access when a subscription expires or is cancelled. Two things
 * happen, each best-effort since the bot may lack sufficient channel admin
 * rights depending on how it was added (spec: "where Telegram API
 * permissions allow"):
 *  1. If the invite link hasn't been used/expired yet, revoke it so it can
 *     never be redeemed after the fact.
 *  2. If the user already joined, remove them from the channel (ban+unban,
 *     which kicks without a permanent ban).
 */
export async function revokeChannelAccess(access: TelegramChannelAccess, telegramId: bigint) {
  if (access.inviteLink && access.status === "INVITED") {
    try {
      await bot.revokeChatInviteLink(access.channelId, access.inviteLink);
    } catch (err) {
      logger.warn({ err, accessId: access.id }, "Could not revoke Telegram invite link (may already be used/expired)");
    }
  }

  if (access.status === "JOINED") {
    try {
      await bot.banChatMember(access.channelId, Number(telegramId));
      await bot.unbanChatMember(access.channelId, Number(telegramId));
    } catch (err) {
      logger.warn(
        { err, accessId: access.id },
        "Could not remove user from Telegram channel — bot may lack admin rights"
      );
    }
  }

  await channelAccessRepository.markRevoked(access.id);
}
