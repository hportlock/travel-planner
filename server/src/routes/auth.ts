import { Router } from 'express';
import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { googleLoginBody } from '@travel-plan/shared';
import { asyncHandler, unauthorized } from '../services/http';
import { verifyGoogleIdToken, type GoogleProfile } from '../auth/google';
import { setSessionCookie, clearSessionCookie } from '../auth/session';

export function authRouter(): Router {
  const r = Router();

  // POST /api/auth/google — verify ID token, upsert user, issue session cookie.
  r.post(
    '/google',
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const { credential } = googleLoginBody.parse(req.body);
      let profile: GoogleProfile;
      try {
        profile = await verifyGoogleIdToken(credential);
      } catch {
        throw unauthorized('Invalid Google credential');
      }

      let user = await db('users').where({ google_sub: profile.sub }).first();
      const ts = new Date().toISOString();
      if (!user) {
        // Claim a pre-provisioned seed owner (google_sub `seed-…`) that shares this
        // verified email, so the seeded trip transfers to the real account. Only
        // adopts seed placeholders — never links to an existing real account by email.
        if (profile.email_verified) {
          const seed = await db('users')
            .where({ email: profile.email })
            .andWhere('google_sub', 'like', 'seed-%')
            .first();
          if (seed) {
            await db('users').where({ id: seed.id }).update({
              google_sub: profile.sub,
              name: profile.name,
              avatar_url: profile.picture ?? null,
              updated_at: ts,
            });
            user = { ...seed, google_sub: profile.sub, name: profile.name, avatar_url: profile.picture ?? null };
          }
        }
      }
      if (!user) {
        user = {
          id: randomUUID(),
          google_sub: profile.sub,
          email: profile.email,
          name: profile.name,
          avatar_url: profile.picture ?? null,
          created_at: ts,
          updated_at: ts,
        };
        await db('users').insert(user);
      } else {
        await db('users')
          .where({ id: user.id })
          .update({ email: profile.email, name: profile.name, avatar_url: profile.picture ?? null, updated_at: ts });
      }

      setSessionCookie(res, user.id);
      res.json({ id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url ?? null });
    }),
  );

  // GET /api/auth/me — current host user (or null).
  r.get(
    '/me',
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const uid = req.auth?.userId;
      if (!uid) {
        res.json({ user: null });
        return;
      }
      const user = await db('users').where({ id: uid }).first();
      res.json({
        user: user ? { id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url ?? null } : null,
      });
    }),
  );

  // POST /api/auth/logout
  r.post('/logout', (req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // GET /api/auth/google/health — surfaces missing config without leaking secrets.
  r.get('/google/health', (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID) throw unauthorized('Google OAuth not configured');
    res.json({ ok: true });
  });

  return r;
}
