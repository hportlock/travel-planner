import { Router } from 'express';
import type { Knex } from 'knex';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import {
  tokensSchema,
  fontsSchema,
  heroSchema,
  layoutSchema,
  themeUpsert,
  CUSTOM_CSS_MAX_BYTES,
} from '@travel-plan/shared';
import { asyncHandler, notFound } from '../services/http';
import { requireOwner, tripIdFromParam } from '../middleware/requireOwner';
import { tripIdOfTheme } from '../services/access';
import { serializeJson } from '../db';
import { mapTheme } from '../services/mappers';
import { sanitizeCustomCss } from '../services/css';

/** Partial upsert (no defaults) so focused MCP updates don't clobber fields. */
const themePatch = z.object({
  name: z.string().min(1).optional(),
  tokens: tokensSchema.optional(),
  fonts: fontsSchema.optional(),
  hero: heroSchema.optional(),
  layout: layoutSchema.optional(),
  custom_css: z.string().max(CUSTOM_CSS_MAX_BYTES, 'custom_css too large').optional(),
});

export function themesRouter(): Router {
  const r = Router();

  // GET /api/trips/:tripId/themes
  r.get(
    '/trips/:tripId/themes',
    requireOwner(tripIdFromParam('tripId')),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const rows = await db('themes').where({ trip_id: req.params.tripId }).orderBy('created_at', 'desc');
      res.json(rows.map(mapTheme));
    }),
  );

  // PATCH /api/trips/:tripId/themes — upsert + sanitize + activate the active theme.
  r.patch(
    '/trips/:tripId/themes',
    requireOwner(tripIdFromParam('tripId')),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const tripId = req.params.tripId;
      const patch = themePatch.parse(req.body);
      const ts = new Date().toISOString();

      let removed: string[] = [];
      const setCols: Record<string, unknown> = { updated_at: ts };
      if (patch.name !== undefined) setCols.name = patch.name;
      if (patch.tokens !== undefined) setCols.tokens = serializeJson(patch.tokens);
      if (patch.fonts !== undefined) setCols.fonts = serializeJson(patch.fonts);
      if (patch.hero !== undefined) setCols.hero = serializeJson(patch.hero);
      if (patch.layout !== undefined) setCols.layout = serializeJson(patch.layout);
      if (patch.custom_css !== undefined) {
        const s = sanitizeCustomCss(patch.custom_css);
        removed = s.removed;
        setCols.custom_css = s.css;
      }

      let active = await db('themes').where({ trip_id: tripId, is_active: true }).first();
      let themeId: string;
      if (active) {
        themeId = active.id;
        await db('themes').where({ id: themeId }).update(setCols);
      } else {
        themeId = randomUUID();
        await db('themes').insert({
          id: themeId,
          trip_id: tripId,
          name: patch.name ?? 'Custom',
          is_active: true,
          tokens: setCols.tokens ?? serializeJson({}),
          fonts: setCols.fonts ?? serializeJson({ display: '', body: '', mono: '', url: '' }),
          hero: setCols.hero ?? serializeJson({ variant: 'postcard', gradient: '', stamp: '', motifs: [] }),
          layout: setCols.layout ?? null,
          custom_css: setCols.custom_css ?? '',
          created_at: ts,
          updated_at: ts,
        });
      }
      const row = await db('themes').where({ id: themeId }).first();
      res.json({ ...mapTheme(row), _sanitized: { removed } });
    }),
  );

  // POST /api/trips/:tripId/themes — create a new theme version (and activate it).
  r.post(
    '/trips/:tripId/themes',
    requireOwner(tripIdFromParam('tripId')),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const tripId = req.params.tripId;
      const input = themeUpsert.parse(req.body);
      const s = sanitizeCustomCss(input.custom_css);
      const id = randomUUID();
      const ts = new Date().toISOString();
      await db.transaction(async (trx) => {
        await trx('themes').where({ trip_id: tripId }).update({ is_active: false });
        await trx('themes').insert({
          id,
          trip_id: tripId,
          name: input.name,
          is_active: true,
          tokens: serializeJson(input.tokens),
          fonts: serializeJson(input.fonts),
          hero: serializeJson(input.hero),
          layout: input.layout ? serializeJson(input.layout) : null,
          custom_css: s.css,
          created_at: ts,
          updated_at: ts,
        });
      });
      const row = await db('themes').where({ id }).first();
      res.status(201).json({ ...mapTheme(row), _sanitized: { removed: s.removed } });
    }),
  );

  // POST /api/themes/:id/activate
  r.post(
    '/themes/:id/activate',
    requireOwner((req, db) => tripIdOfTheme(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const th = await db('themes').where({ id: req.params.id }).first();
      if (!th) throw notFound();
      await db.transaction(async (trx) => {
        await trx('themes').where({ trip_id: th.trip_id }).update({ is_active: false });
        await trx('themes').where({ id: th.id }).update({ is_active: true });
      });
      const row = await db('themes').where({ id: req.params.id }).first();
      res.json(mapTheme(row));
    }),
  );

  return r;
}
