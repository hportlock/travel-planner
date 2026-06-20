import { Router } from 'express';
import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { tokenCreate } from '@travel-plan/shared';
import { asyncHandler, notFound } from '../services/http';
import { requireUser } from '../middleware/requireUser';
import { generatePat } from '../auth/pat';

/** Personal access tokens for MCP Bearer auth. Host-only; plaintext shown once. */
export function tokensRouter(): Router {
  const r = Router();
  r.use(requireUser);

  // POST /api/tokens — mint a token (returns plaintext once).
  r.post(
    '/',
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const { label } = tokenCreate.parse(req.body ?? {});
      const { plaintext, hash } = generatePat();
      const id = randomUUID();
      const ts = new Date().toISOString();
      await db('personal_access_tokens').insert({
        id,
        user_id: req.auth!.userId,
        token_hash: hash,
        label,
        last_used_at: null,
        created_at: ts,
        updated_at: ts,
      });
      res.status(201).json({ id, label, token: plaintext, created_at: ts });
    }),
  );

  // GET /api/tokens — list (no plaintext).
  r.get(
    '/',
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const rows = await db('personal_access_tokens')
        .where({ user_id: req.auth!.userId })
        .orderBy('created_at', 'desc')
        .select('id', 'label', 'last_used_at', 'created_at');
      res.json(rows);
    }),
  );

  // DELETE /api/tokens/:id — revoke.
  r.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const count = await db('personal_access_tokens')
        .where({ id: req.params.id, user_id: req.auth!.userId })
        .del();
      if (!count) throw notFound('Token not found');
      res.json({ ok: true });
    }),
  );

  return r;
}
