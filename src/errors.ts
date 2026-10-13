import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(404, "ROUTE_NOT_FOUND", `Route ${req.method} ${req.path} does not exist`));
};

// One error format everywhere: { "error": { "code", "message", "details"? } }
// Stack traces and internals are never sent to clients.
export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
  }
  const e = err as { type?: string };
  if (e?.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
  }
  if (e?.type === "entity.too.large") {
    return res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" } });
  }
  console.error("Unhandled error:", err);
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
};
