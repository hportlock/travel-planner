import type { Knex } from 'knex';
import {
  sortDayItems,
  type TripDetail,
  type EventWithReviews,
  type ItineraryWithDays,
  type DayWithItems,
} from '@travel-plan/shared';
import {
  mapTrip,
  mapLodging,
  mapEvent,
  mapReview,
  mapItinerary,
  mapDay,
  mapDayItem,
  mapTheme,
} from './mappers';

/** Assemble the full read DTO for a trip (used by owner + public-share reads). */
export async function buildTripDetail(db: Knex, tripId: string): Promise<TripDetail | null> {
  const tripRaw = await db('trips').where({ id: tripId }).first();
  if (!tripRaw) return null;
  const trip = mapTrip(tripRaw);

  const lodging = (await db('lodging').where({ trip_id: tripId }).orderBy('is_home_base', 'desc').orderBy('name'))
    .map(mapLodging);

  const eventRows = await db('events').where({ trip_id: tripId }).orderBy('name');
  const events: EventWithReviews[] = [];
  const eventIds = eventRows.map((e: any) => e.id);
  const reviewRows = eventIds.length
    ? await db('reviews').whereIn('event_id', eventIds).orderBy('position')
    : [];
  const reviewsByEvent = new Map<string, ReturnType<typeof mapReview>[]>();
  for (const r of reviewRows) {
    const rr = mapReview(r);
    const arr = reviewsByEvent.get(rr.event_id) ?? [];
    arr.push(rr);
    reviewsByEvent.set(rr.event_id, arr);
  }
  for (const e of eventRows) {
    const ev = mapEvent(e);
    events.push({ ...ev, reviews: reviewsByEvent.get(ev.id) ?? [] });
  }

  const itinRows = await db('itineraries').where({ trip_id: tripId }).orderBy('position');
  const itineraries: ItineraryWithDays[] = [];
  for (const it of itinRows) {
    const itin = mapItinerary(it);
    const dayRows = await db('days').where({ itinerary_id: itin.id }).orderBy('position');
    const days: DayWithItems[] = [];
    for (const d of dayRows) {
      const day = mapDay(d);
      const itemRows = await db('day_items').where({ day_id: day.id });
      const items = sortDayItems(itemRows.map(mapDayItem));
      days.push({ ...day, items });
    }
    itineraries.push({ ...itin, days });
  }

  const activeItinerary = itineraries.find((i) => i.is_active) ?? itineraries[0] ?? null;

  const themeRaw = await db('themes').where({ trip_id: tripId, is_active: true }).first();
  const theme = themeRaw ? mapTheme(themeRaw) : null;

  return { ...trip, lodging, events, itineraries, activeItinerary, theme };
}
