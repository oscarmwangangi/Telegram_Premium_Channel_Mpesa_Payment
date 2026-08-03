import nodemailer from "nodemailer";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { EmailType } from "@prisma/client";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
});

interface SendEmailParams {
  userId?: string | null;
  type: EmailType;
  to: string;
  subject: string;
  html: string;
  metadata?: unknown;
  sentByAdminId?: string;
}

/**
 * Every email — successful or not — is recorded in EmailNotification first
 * (status QUEUED), then flipped to SENT/FAILED after the SMTP call. This
 * means "did this user get their receipt?" is always answerable from the
 * DB, not just from mail-server logs, and the admin dashboard's
 * failed-notifications view has something to show.
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const record = await prisma.emailNotification.create({
    data: {
      userId: params.userId ?? null,
      type: params.type,
      recipientEmail: params.to,
      subject: params.subject,
      status: "QUEUED",
      metadata: (params.metadata ?? null) as never,
      sentByAdminId: params.sentByAdminId ?? null,
    },
  });

  try {
    await transporter.sendMail({
      from: env.EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    await prisma.emailNotification.update({
      where: { id: record.id },
      data: { status: "SENT", sentAt: new Date() },
    });
    return true;
  } catch (err) {
    logger.error({ err, notificationId: record.id, type: params.type }, "Failed to send email");
    await prisma.emailNotification.update({
      where: { id: record.id },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "Unknown SMTP error",
      },
    });
    return false;
  }
}
