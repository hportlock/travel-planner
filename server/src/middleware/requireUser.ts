import type { Request, Response, NextFunction } from 'express';
import { unauthorized } from '../services/http';

/** Require any authenticated host user (session cookie or PAT). */
export function requireUser(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth?.userId) return next(unauthorized());
  next();
}
