import type { Response } from "express";

interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function ok<T>(res: Response, data: T, meta?: PaginationMeta, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}

export function created<T>(res: Response, data: T) {
  return ok(res, data, undefined, 201);
}

export function fail(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
) {
  return res.status(statusCode).json({
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  });
}
