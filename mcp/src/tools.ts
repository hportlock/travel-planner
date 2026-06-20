import { z } from 'zod';
import {
  tripCreate,
  tripUpdate,
  lodgingCreate,
  lodgingUpdate,
  eventCreate,
  eventUpdate,
  reviewCreate,
  itineraryCreate,
  itineraryUpdate,
  dayCreate,
  dayUpdate,
  timeOfDay,
  hhmm,
  uuid,
  reorderBody,
  themeUpsert,
  layoutSchema,
  CUSTOM_CSS_MAX_BYTES,
  getThemingApi,
} from '@travel-plan/shared';
import type { RestClientLike } from './client';

export interface ToolDef<I = any> {
  name: string;
  description: string;
  schema: z.ZodType<I>;
  handler: (client: RestClientLike, input: I) => Promise<any>;
}

// Plain (non-refined) day_item shape — the server re-validates the refine rule.
const dayItemFields = {
  event_id: uuid,
  position: z.number().int().optional(),
  start_time: hhmm.nullable().optional(),
  end_time: hhmm.nullable().optional(),
  time_of_day: timeOfDay.nullable().optional(),
  note: z.string().optional(),
};

const t = <I>(def: ToolDef<I>): ToolDef<I> => def;

function strip<T extends Record<string, any>>(input: T, keys: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(input)) if (!keys.includes(k)) out[k] = input[k];
  return out;
}

export const tools: ToolDef[] = [
  t({
    name: 'list_trips',
    description: 'List the host’s trips.',
    schema: z.object({}),
    handler: (c) => c.get('/api/trips'),
  }),
  t({
    name: 'get_trip',
    description: 'Get one trip with full detail (lodging, events, itineraries, theme).',
    schema: z.object({ trip_id: uuid }),
    handler: (c, i) => c.get(`/api/trips/${i.trip_id}`),
  }),
  t({
    name: 'create_trip',
    description: 'Create a trip (auto-creates one active itinerary). Include an IANA timezone.',
    schema: tripCreate,
    handler: (c, i) => c.post('/api/trips', i),
  }),
  t({
    name: 'update_trip',
    description: 'Update trip fields.',
    schema: z.object({ trip_id: uuid }).and(tripUpdate),
    handler: (c, i) => c.patch(`/api/trips/${i.trip_id}`, strip(i, ['trip_id'])),
  }),

  // ---- lodging ----
  t({
    name: 'add_lodging',
    description: 'Add lodging to a trip.',
    schema: z.object({ trip_id: uuid }).and(lodgingCreate),
    handler: (c, i) => c.post(`/api/trips/${i.trip_id}/lodging`, strip(i, ['trip_id'])),
  }),
  t({
    name: 'update_lodging',
    description: 'Update a lodging record.',
    schema: z.object({ lodging_id: uuid }).and(lodgingUpdate),
    handler: (c, i) => c.patch(`/api/lodging/${i.lodging_id}`, strip(i, ['lodging_id'])),
  }),
  t({
    name: 'remove_lodging',
    description: 'Delete a lodging record.',
    schema: z.object({ lodging_id: uuid }),
    handler: (c, i) => c.del(`/api/lodging/${i.lodging_id}`),
  }),

  // ---- events / reviews ----
  t({
    name: 'add_event',
    description: 'Add an activity/event to a trip’s catalog.',
    schema: z.object({ trip_id: uuid }).and(eventCreate),
    handler: (c, i) => c.post(`/api/trips/${i.trip_id}/events`, strip(i, ['trip_id'])),
  }),
  t({
    name: 'update_event',
    description: 'Update an event.',
    schema: z.object({ event_id: uuid }).and(eventUpdate),
    handler: (c, i) => c.patch(`/api/events/${i.event_id}`, strip(i, ['event_id'])),
  }),
  t({
    name: 'remove_event',
    description: 'Delete an event.',
    schema: z.object({ event_id: uuid }),
    handler: (c, i) => c.del(`/api/events/${i.event_id}`),
  }),
  t({
    name: 'add_review',
    description: 'Add a review to an event.',
    schema: z.object({ event_id: uuid }).and(reviewCreate),
    handler: (c, i) => c.post(`/api/events/${i.event_id}/reviews`, strip(i, ['event_id'])),
  }),
  t({
    name: 'remove_review',
    description: 'Delete a review.',
    schema: z.object({ review_id: uuid }),
    handler: (c, i) => c.del(`/api/reviews/${i.review_id}`),
  }),

  // ---- itineraries ----
  t({
    name: 'create_itinerary',
    description: 'Create an itinerary variant for a trip.',
    schema: z.object({ trip_id: uuid }).and(itineraryCreate),
    handler: (c, i) => c.post(`/api/trips/${i.trip_id}/itineraries`, strip(i, ['trip_id'])),
  }),
  t({
    name: 'duplicate_itinerary',
    description: 'Duplicate an itinerary (with its days and items) — e.g. to draft a variant.',
    schema: z.object({ itinerary_id: uuid, name: z.string().optional(), slug: z.string().optional() }),
    handler: (c, i) => c.post(`/api/itineraries/${i.itinerary_id}/duplicate`, strip(i, ['itinerary_id'])),
  }),
  t({
    name: 'update_itinerary',
    description: 'Update an itinerary’s fields.',
    schema: z.object({ itinerary_id: uuid }).and(itineraryUpdate),
    handler: (c, i) => c.patch(`/api/itineraries/${i.itinerary_id}`, strip(i, ['itinerary_id'])),
  }),
  t({
    name: 'activate_itinerary',
    description: 'Make an itinerary the active "keeper" (exactly one active per trip).',
    schema: z.object({ itinerary_id: uuid }),
    handler: (c, i) => c.post(`/api/itineraries/${i.itinerary_id}/activate`, {}),
  }),

  // ---- days ----
  t({
    name: 'add_day',
    description: 'Add a day to an itinerary.',
    schema: z.object({ itinerary_id: uuid }).and(dayCreate),
    handler: (c, i) => c.post(`/api/itineraries/${i.itinerary_id}/days`, strip(i, ['itinerary_id'])),
  }),
  t({
    name: 'update_day',
    description: 'Update a day.',
    schema: z.object({ day_id: uuid }).and(dayUpdate),
    handler: (c, i) => c.patch(`/api/days/${i.day_id}`, strip(i, ['day_id'])),
  }),
  t({
    name: 'remove_day',
    description: 'Delete a day.',
    schema: z.object({ day_id: uuid }),
    handler: (c, i) => c.del(`/api/days/${i.day_id}`),
  }),

  // ---- day items ----
  t({
    name: 'add_day_item',
    description: 'Place an event on a day (with start_time/end_time or a time_of_day bucket).',
    schema: z.object({ day_id: uuid, ...dayItemFields }),
    handler: (c, i) => c.post(`/api/days/${i.day_id}/items`, strip(i, ['day_id'])),
  }),
  t({
    name: 'update_day_item',
    description: 'Update a placement.',
    schema: z.object({ item_id: uuid, ...dayItemFields, event_id: uuid.optional() }),
    handler: (c, i) => c.patch(`/api/day-items/${i.item_id}`, strip(i, ['item_id'])),
  }),
  t({
    name: 'remove_day_item',
    description: 'Remove a placement.',
    schema: z.object({ item_id: uuid }),
    handler: (c, i) => c.del(`/api/day-items/${i.item_id}`),
  }),
  t({
    name: 'reorder_day',
    description: 'Reorder a day’s items by passing the full ordered list of item ids.',
    schema: z.object({ day_id: uuid }).and(reorderBody),
    handler: (c, i) => c.post(`/api/days/${i.day_id}/reorder`, { itemIds: i.itemIds }),
  }),

  // ---- theming ----
  t({
    name: 'get_theming_api',
    description: 'Return the documented CSS hooks (.tp-* classes, data-* attrs) and layout-variant enums for designing custom_css.',
    schema: z.object({}),
    handler: async () => getThemingApi(),
  }),
  t({
    name: 'set_theme',
    description: 'Upsert + activate the trip theme with the full layered design (tokens, fonts, hero, layout, custom_css). custom_css is sanitized & scoped server-side.',
    schema: z.object({ trip_id: uuid }).and(themeUpsert.partial()),
    handler: (c, i) => c.patch(`/api/trips/${i.trip_id}/themes`, strip(i, ['trip_id'])),
  }),
  t({
    name: 'set_layout',
    description: 'Set just the T2 structured layout config.',
    schema: z.object({ trip_id: uuid, layout: layoutSchema }),
    handler: (c, i) => c.patch(`/api/trips/${i.trip_id}/themes`, { layout: i.layout }),
  }),
  t({
    name: 'set_custom_css',
    description: 'Set just the T3 scoped custom CSS (sanitized server-side).',
    schema: z.object({ trip_id: uuid, custom_css: z.string().max(CUSTOM_CSS_MAX_BYTES) }),
    handler: (c, i) => c.patch(`/api/trips/${i.trip_id}/themes`, { custom_css: i.custom_css }),
  }),
  t({
    name: 'list_themes',
    description: 'List a trip’s theme versions.',
    schema: z.object({ trip_id: uuid }),
    handler: (c, i) => c.get(`/api/trips/${i.trip_id}/themes`),
  }),
  t({
    name: 'activate_theme',
    description: 'Activate a specific theme version.',
    schema: z.object({ theme_id: uuid }),
    handler: (c, i) => c.post(`/api/themes/${i.theme_id}/activate`, {}),
  }),

  // ---- sharing ----
  t({
    name: 'create_share_link',
    description: 'Mint a read-only viewer share link for a trip.',
    schema: z.object({ trip_id: uuid, label: z.string().optional() }),
    handler: (c, i) => c.post(`/api/trips/${i.trip_id}/share`, { label: i.label ?? '' }),
  }),
];

export const toolsByName: Record<string, ToolDef> = Object.fromEntries(tools.map((x) => [x.name, x]));
