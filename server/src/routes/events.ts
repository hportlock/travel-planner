import { Router } from 'express';
import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { eventCreate, eventUpdate, reviewCreate, reviewUpdate } from '@travel-plan/shared';
import { asyncHandler, notFound, badRequest } from '../services/http';
import { requireOwner, tripIdFromParam } from '../middleware/requireOwner';
import { tripIdOfEvent, tripIdOfReview } from '../services/access';
import { serializeJson } from '../db';
import { mapEvent, mapReview } from '../services/mappers';

export function eventsRouter(): Router {
  const r = Router();

  // GET /api/trips/:tripId/events
  r.get(
    '/trips/:tripId/events',
    requireOwner(tripIdFromParam('tripId')),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const rows = await db('events').where({ trip_id: req.params.tripId }).orderBy('name');
      res.json(rows.map(mapEvent));
    }),
  );

  // POST /api/trips/:tripId/events
  r.post(
    '/trips/:tripId/events',
    requireOwner(tripIdFromParam('tripId')),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const input = eventCreate.parse(req.body);
      const exists = await db('events').where({ trip_id: req.params.tripId, slug: input.slug }).first();
      if (exists) throw badRequest('An event with that slug already exists in this trip');
      const id = randomUUID();
      const ts = new Date().toISOString();
      await db('events').insert({
        id,
        trip_id: req.params.tripId,
        slug: input.slug,
        name: input.name,
        emoji: input.emoji,
        region: input.region,
        url: input.url,
        gmap_url: input.gmap_url,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        drive: input.drive,
        cost: input.cost,
        ages: input.ages,
        booking: input.booking,
        meal: input.meal ?? null,
        rating: input.rating ?? null,
        blurb: input.blurb,
        tags: serializeJson(input.tags),
        created_at: ts,
        updated_at: ts,
      });
      const row = await db('events').where({ id }).first();
      res.status(201).json({ ...mapEvent(row), reviews: [] });
    }),
  );

  // PATCH /api/events/:id
  r.patch(
    '/events/:id',
    requireOwner((req, db) => tripIdOfEvent(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const patch = eventUpdate.parse(req.body);
      const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of [
        'slug', 'name', 'emoji', 'region', 'url', 'gmap_url', 'lat', 'lng', 'drive', 'cost', 'ages', 'booking', 'meal', 'rating', 'blurb',
      ] as const) {
        if (patch[k] !== undefined) upd[k] = patch[k];
      }
      if (patch.tags !== undefined) upd.tags = serializeJson(patch.tags);
      await db('events').where({ id: req.params.id }).update(upd);
      const row = await db('events').where({ id: req.params.id }).first();
      if (!row) throw notFound();
      res.json(mapEvent(row));
    }),
  );

  // DELETE /api/events/:id
  r.delete(
    '/events/:id',
    requireOwner((req, db) => tripIdOfEvent(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      await db('events').where({ id: req.params.id }).del();
      res.json({ ok: true });
    }),
  );

  // POST /api/events/:id/reviews
  r.post(
    '/events/:id/reviews',
    requireOwner((req, db) => tripIdOfEvent(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const input = reviewCreate.parse(req.body);
      const id = randomUUID();
      const ts = new Date().toISOString();
      let position = input.position;
      if (position === undefined) {
        const max = await db('reviews').where({ event_id: req.params.id }).max('position as m').first();
        position = (max?.m ?? -1) + 1;
      }
      await db('reviews').insert({
        id,
        event_id: req.params.id,
        quote: input.quote,
        who: input.who,
        stars: input.stars,
        position,
        created_at: ts,
        updated_at: ts,
      });
      const row = await db('reviews').where({ id }).first();
      res.status(201).json(mapReview(row));
    }),
  );

  // PATCH /api/reviews/:id
  r.patch(
    '/reviews/:id',
    requireOwner((req, db) => tripIdOfReview(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const patch = reviewUpdate.parse(req.body);
      const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ['quote', 'who', 'stars', 'position'] as const) {
        if (patch[k] !== undefined) upd[k] = patch[k];
      }
      await db('reviews').where({ id: req.params.id }).update(upd);
      const row = await db('reviews').where({ id: req.params.id }).first();
      if (!row) throw notFound();
      res.json(mapReview(row));
    }),
  );

  // DELETE /api/reviews/:id
  r.delete(
    '/reviews/:id',
    requireOwner((req, db) => tripIdOfReview(db, req.params.id)),
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      await db('reviews').where({ id: req.params.id }).del();
      res.json({ ok: true });
    }),
  );

  return r;
}
