import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Error with an HTTP status; thrown by routes/services and mapped by error.ts. */
export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (msg = 'Not found') => new ApiError(404, msg);
export const forbidden = (msg = 'Forbidden') => new ApiError(403, msg);
export const unauthorized = (msg = 'Unauthorized') => new ApiError(401, msg);
export const badRequest = (msg = 'Bad request', details?: unknown) => new ApiError(400, msg, details);

/** Wrap an async handler so thrown/rejected errors reach the error middleware. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
