import type { Knex } from 'knex';

/** Resolve the owning trip id for various nested resources (or null). */
export async function tripIdOfItinerary(db: Knex, id: string): Promise<string | null> {
  const r = await db('itineraries').where({ id }).first('trip_id');
  return r?.trip_id ?? null;
}

export async function tripIdOfDay(db: Knex, id: string): Promise<string | null> {
  const r = await db('days')
    .join('itineraries', 'days.itinerary_id', 'itineraries.id')
    .where('days.id', id)
    .first('itineraries.trip_id as trip_id');
  return r?.trip_id ?? null;
}

export async function tripIdOfDayItem(db: Knex, id: string): Promise<string | null> {
  const r = await db('day_items')
    .join('days', 'day_items.day_id', 'days.id')
    .join('itineraries', 'days.itinerary_id', 'itineraries.id')
    .where('day_items.id', id)
    .first('itineraries.trip_id as trip_id');
  return r?.trip_id ?? null;
}

export async function tripIdOfEvent(db: Knex, id: string): Promise<string | null> {
  const r = await db('events').where({ id }).first('trip_id');
  return r?.trip_id ?? null;
}

export async function tripIdOfReview(db: Knex, id: string): Promise<string | null> {
  const r = await db('reviews')
    .join('events', 'reviews.event_id', 'events.id')
    .where('reviews.id', id)
    .first('events.trip_id as trip_id');
  return r?.trip_id ?? null;
}

export async function tripIdOfLodging(db: Knex, id: string): Promise<string | null> {
  const r = await db('lodging').where({ id }).first('trip_id');
  return r?.trip_id ?? null;
}

export async function tripIdOfTheme(db: Knex, id: string): Promise<string | null> {
  const r = await db('themes').where({ id }).first('trip_id');
  return r?.trip_id ?? null;
}

export async function tripExists(db: Knex, tripId: string): Promise<boolean> {
  const r = await db('trips').where({ id: tripId }).first('id');
  return !!r;
}

export async function isOwner(db: Knex, tripId: string, userId: string): Promise<boolean> {
  const r = await db('trips').where({ id: tripId, owner_id: userId }).first('id');
  return !!r;
}
