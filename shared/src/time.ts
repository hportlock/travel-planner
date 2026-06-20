import type { DayItemRow, TimeOfDay } from './types';

/**
 * Deterministic ordering within a day (decided with user):
 *  - timed items sort by start_time;
 *  - untimed items sort by their time_of_day bucket;
 *  - the two interleave by mapping each bucket to a nominal sort time;
 *  - items with neither time nor bucket fall to the end, ordered by position.
 * Stable tiebreak on `position`, then `id`.
 */

export const BUCKET_ORDER: Record<TimeOfDay, number> = {
  morning: 0,
  midday: 1,
  afternoon: 2,
  evening: 3,
  night: 4,
};

/** Nominal wall-clock minute each bucket maps to, for interleaving with timed items. */
export const BUCKET_NOMINAL_MINUTES: Record<TimeOfDay, number> = {
  morning: 9 * 60, // 09:00
  midday: 12 * 60, // 12:00
  afternoon: 14 * 60, // 14:00
  evening: 18 * 60, // 18:00
  night: 21 * 60, // 21:00
};

const END = Number.MAX_SAFE_INTEGER;

/** Parse "HH:MM" -> minutes since midnight, or null. */
export function parseHHMM(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** The minute key used to place a day_item on the timeline. */
export function dayItemSortMinute(item: Pick<DayItemRow, 'start_time' | 'time_of_day'>): number {
  const timed = parseHHMM(item.start_time);
  if (timed !== null) return timed;
  if (item.time_of_day && item.time_of_day in BUCKET_NOMINAL_MINUTES) {
    return BUCKET_NOMINAL_MINUTES[item.time_of_day];
  }
  return END;
}

/** Returns a new array of day_items sorted by the rule above. */
export function sortDayItems<T extends Pick<DayItemRow, 'start_time' | 'time_of_day' | 'position' | 'id'>>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    const ka = dayItemSortMinute(a);
    const kb = dayItemSortMinute(b);
    if (ka !== kb) return ka - kb;
    if (a.position !== b.position) return a.position - b.position;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Convert "HH:MM" 24h -> "h:mmam/pm" 12h for display. */
export function formatTime12(t: string | null | undefined): string {
  const mins = parseHHMM(t ?? null);
  if (mins === null) return '';
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, '0')}${ampm}`;
}
