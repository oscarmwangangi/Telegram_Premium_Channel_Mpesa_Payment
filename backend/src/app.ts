import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { apiRouter } from "@/routes";
import { errorHandler, notFoundHandler } from "@/middleware/error-handler";
import { generalLimiter } from "@/middleware/rate-limiter";

export function createApp() {
  const app = express();

  const allowedOrigins = env.CORS_ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(
    cors({
      origin: allowedOrigins.length ? allowedOrigins : false,
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));
  app.use(generalLimiter);

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
