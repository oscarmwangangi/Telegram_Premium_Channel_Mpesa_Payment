import pino from "pino";
import { isProduction } from "@/config/env";

export const logger = pino({
  level: isProduction ? "info" : "debug",
  redact: {
    // Never let PII/secrets hit the log stream, even by accident.
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.phone",
      "*.phoneNumber",
      "*.password",
      "*.passwordHash",
      "*.consumerSecret",
      "*.accessToken",
      "*.refreshToken",
    ],
    censor: "[redacted]",
  },
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
});
