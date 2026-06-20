import { Router } from 'express';
import type { Knex } from 'knex';
import { getThemingApi } from '@travel-plan/shared';
import { asyncHandler, notFound } from '../services/http';
import { buildTripDetail } from '../services/tripDetail';

/** Public, read-only access to a single trip via its viewer share token. */
export function sharedRouter(): Router {
  const r = Router();

  // GET /api/shared/:shareToken — resolve the trip read-only.
  r.get(
    '/shared/:shareToken',
    asyncHandler(async (req, res) => {
      const db = req.app.locals.db as Knex;
      const access = await db('trip_access').where({ token: req.params.shareToken }).first();
      if (!access) throw notFound('Invalid share link');
      const detail = await buildTripDetail(db, access.trip_id);
      if (!detail) throw notFound('Trip not found');
      res.json(detail);
    }),
  );

  // GET /api/theming-api — documented CSS hooks + layout variant enums.
  r.get('/theming-api', (_req, res) => {
    res.json(getThemingApi());
  });

  return r;
}
