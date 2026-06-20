import type { Request, Response, NextFunction } from 'express';
import type { Knex } from 'knex';
import { ApiError, unauthorized, notFound, forbidden } from '../services/http';
import { tripExists, isOwner } from '../services/access';

export type TripIdResolver = (req: Request, db: Knex) => Promise<string | null>;

/** Mutating routes: require an authenticated user who owns the target trip. */
export function requireOwner(resolveTripId: TripIdResolver) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const db = req.app.locals.db as Knex;
      const userId = req.auth?.userId;
      if (!userId) throw unauthorized();

      const tripId = await resolveTripId(req, db);
      if (!tripId) throw notFound();
      if (!(await tripExists(db, tripId))) throw notFound();
      if (!(await isOwner(db, tripId, userId))) throw forbidden('You do not own this trip');

      // Stash the resolved trip id for handlers.
      (req as Request & { tripId?: string }).tripId = tripId;
      req.auth = { ...req.auth!, tripScope: tripId, role: 'owner' };
      next();
    } catch (err) {
      next(err instanceof ApiError ? err : new ApiError(500, 'Authorization error'));
    }
  };
}

/** Common resolver: trip id is in :id (or :tripId) of the path. */
export const tripIdFromParam =
  (param = 'id'): TripIdResolver =>
  async (req) =>
    (req.params[param] as string) ?? null;
