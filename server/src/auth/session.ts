import jwt from 'jsonwebtoken';
import type { Response } from 'express';

export const SESSION_COOKIE = 'tp_session';

function secret(): string {
  return process.env.SESSION_SECRET || 'dev-only-insecure-session-secret-change-me';
}

export function signSession(userId: string): string {
  return jwt.sign({ uid: userId }, secret(), { expiresIn: '30d' });
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret()) as { uid?: string };
    return payload.uid ?? null;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, userId: string): void {
  res.cookie(SESSION_COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}
