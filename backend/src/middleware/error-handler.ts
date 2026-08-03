import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { fail } from "@/lib/http-response";
import { logger } from "@/lib/logger";

export function notFoundHandler(req: Request, res: Response) {
  fail(res, 404, "NOT_FOUND", `Route ${req.method} ${req.path} not found`);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    return fail(res, 400, "VALIDATION_ERROR", "Invalid request", err.flatten());
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path }, err.message);
    } else {
      logger.warn({ code: err.code, path: req.path }, err.message);
    }
    return fail(res, err.statusCode, err.code, err.message, err.details);
  }

  logger.error({ err, path: req.path }, "Unhandled error");
  return fail(res, 500, "INTERNAL_ERROR", "Something went wrong");
}
