import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError, type z } from "zod";

/**
 * Every error response has the same shape:
 *   { "error": { "code": "SOME_CODE", "message": "Human readable", "details"?: … } }
 * `code` is stable so the web app can show the right message / i18n text.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const errors = {
  badRequest: (code: string, message: string, details?: unknown) => new ApiError(400, code, message, details),
  unauthorized: (message = "Please sign in.") => new ApiError(401, "UNAUTHORIZED", message),
  forbidden: (message = "You don't have access to this.") => new ApiError(403, "FORBIDDEN", message),
  notFound: (what = "Resource") => new ApiError(404, "NOT_FOUND", `${what} not found.`),
  conflict: (code: string, message: string) => new ApiError(409, code, message),
  locked: (until: Date) =>
    new ApiError(423, "ACCOUNT_LOCKED", "Too many failed attempts. Try again later.", {
      lockedUntil: until.toISOString(),
    }),
};

/** Parse with a Zod schema; a failure becomes a 400 VALIDATION_ERROR listing every field problem. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

function validationError(err: ZodError): ApiError {
  return errors.badRequest(
    "VALIDATION_ERROR",
    "Some fields are invalid.",
    err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  );
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new ApiError(404, "NOT_FOUND", "No such endpoint."));
};

/** Database errors can quote the values in a query (a phone number, say), so log only what they are. */
export function safeForLogs(err: unknown): unknown {
  const e = err as { name?: unknown; code?: unknown } | null;
  return typeof e?.name === "string" && e.name.startsWith("PrismaClient")
    ? { name: e.name, code: typeof e.code === "string" ? e.code : undefined }
    : err;
}

/** Hides the secret part of table, receipt and booking links. */
export function redactLinkTokens(url: string): string {
  return url.replace(/(\/api\/(?:tables|receipts|reservations\/manage)\/)[^/?]+/, "$1[hidden]");
}

/** Last middleware: converts anything thrown into the standard error body. Never leaks internals. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let apiError: ApiError;
  if (err instanceof ApiError) apiError = err;
  else if (err instanceof ZodError) apiError = validationError(err);
  else if (err?.type === "entity.parse.failed") apiError = errors.badRequest("INVALID_JSON", "Body is not valid JSON.");
  else if (err?.type === "entity.too.large")
    apiError = new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  else {
    req.log?.error({ err: safeForLogs(err) }, "Unhandled error");
    apiError = new ApiError(500, "INTERNAL", "Something went wrong. Please try again.");
  }
  if (res.headersSent) return;
  res.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details !== undefined ? { details: apiError.details } : {}),
    },
  });
};
