import type { Request, Response, NextFunction } from 'express';
import type { Knex } from 'knex';
import { SESSION_COOKIE, verifySession } from '../auth/session';
import { hashPat, looksLikePat } from '../auth/pat';

/**
 * Resolves the caller and attaches req.auth. Order:
 *  (a) session cookie  -> host user
 *  (b) Authorization: Bearer <PAT> -> host user (for MCP)
 * Viewer share-token access is handled by the dedicated /api/shared routes,
 * not here, so that no mutating route can ever be reached with a viewer token.
 */
export async function resolveAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const db = req.app.locals.db as Knex;

    // (a) session cookie
    const cookieUid = verifySession(req.cookies?.[SESSION_COOKIE]);
    if (cookieUid) {
      req.auth = { userId: cookieUid, role: 'owner' };
      return next();
    }

    // (b) bearer PAT
    const authz = req.header('authorization');
    if (authz && authz.toLowerCase().startsWith('bearer ')) {
      const token = authz.slice(7).trim();
      if (looksLikePat(token)) {
        const row = await db('personal_access_tokens').where({ token_hash: hashPat(token) }).first();
        if (row) {
          await db('personal_access_tokens').where({ id: row.id }).update({ last_used_at: new Date().toISOString() });
          req.auth = { userId: row.user_id, role: 'owner' };
          return next();
        }
      }
    }

    req.auth = { role: 'none' };
    next();
  } catch (err) {
    next(err);
  }
}
