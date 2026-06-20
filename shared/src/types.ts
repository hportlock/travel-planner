import type { z } from 'zod';
import type {
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
  dayItemCreate,
  dayItemUpdate,
  themeUpsert,
  layoutSchema,
  fontsSchema,
  heroSchema,
  regionsMap,
  TIME_OF_DAY,
} from './schemas';

/* ---- Input types (inferred from zod, post-parse / output shape) ---- */
export type TripInput = z.output<typeof tripCreate>;
export type TripPatch = z.output<typeof tripUpdate>;
export type LodgingInput = z.output<typeof lodgingCreate>;
export type LodgingPatch = z.output<typeof lodgingUpdate>;
export type EventInput = z.output<typeof eventCreate>;
export type EventPatch = z.output<typeof eventUpdate>;
export type ReviewInput = z.output<typeof reviewCreate>;
export type ItineraryInput = z.output<typeof itineraryCreate>;
export type ItineraryPatch = z.output<typeof itineraryUpdate>;
export type DayInput = z.output<typeof dayCreate>;
export type DayPatch = z.output<typeof dayUpdate>;
export type DayItemInput = z.output<typeof dayItemCreate>;
export type DayItemPatch = z.output<typeof dayItemUpdate>;
export type ThemeInput = z.output<typeof themeUpsert>;
export type LayoutConfig = z.output<typeof layoutSchema>;
export type Fonts = z.output<typeof fontsSchema>;
export type Hero = z.output<typeof heroSchema>;
export type RegionsMap = z.output<typeof regionsMap>;
export type TimeOfDay = (typeof TIME_OF_DAY)[number];

/* ---- DB row types (app-level shape; JSON columns already parsed) ---- */
export interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface PersonalAccessTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  label: string;
  last_used_at: string | null;
  created_at: string;
}

export interface TripRow {
  id: string;
  owner_id: string;
  title: string;
  subtitle: string;
  destination: string;
  timezone: string;
  start_date: string | null;
  end_date: string | null;
  party: string;
  regions: RegionsMap;
  created_at: string;
  updated_at: string;
}

export interface TripAccessRow {
  id: string;
  trip_id: string;
  role: 'viewer';
  token: string;
  label: string;
  created_at: string;
}

export interface LodgingRow {
  id: string;
  trip_id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  gmap_url: string;
  check_in: string | null;
  check_out: string | null;
  cost: string;
  notes: string;
  is_home_base: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: string;
  trip_id: string;
  slug: string;
  name: string;
  emoji: string;
  region: string;
  url: string;
  gmap_url: string;
  lat: number | null;
  lng: number | null;
  drive: string;
  cost: string;
  ages: string;
  booking: string;
  meal: string | null;
  rating: string | null;
  blurb: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ReviewRow {
  id: string;
  event_id: string;
  quote: string;
  who: string;
  stars: number;
  position: number;
}

export interface ItineraryRow {
  id: string;
  trip_id: string;
  slug: string;
  name: string;
  vibe: string;
  position: number;
  is_active: boolean;
}

export interface DayRow {
  id: string;
  itinerary_id: string;
  position: number;
  dow: string;
  date_label: string;
  date: string | null;
  flag: string;
  flag_color: string;
  drive: string;
  note: string;
}

export interface DayItemRow {
  id: string;
  day_id: string;
  event_id: string;
  position: number;
  start_time: string | null;
  end_time: string | null;
  time_of_day: TimeOfDay | null;
  note: string;
}

export interface ThemeRow {
  id: string;
  trip_id: string;
  name: string;
  is_active: boolean;
  tokens: Record<string, string>;
  fonts: Fonts;
  hero: Hero;
  layout: LayoutConfig | null;
  custom_css: string;
  created_at: string;
  updated_at: string;
}

/* ---- Composed read DTOs (what GET endpoints return) ---- */
export type EventWithReviews = EventRow & { reviews: ReviewRow[] };
export type DayWithItems = DayRow & { items: DayItemRow[] };
export type ItineraryWithDays = ItineraryRow & { days: DayWithItems[] };

export interface TripDetail extends TripRow {
  lodging: LodgingRow[];
  events: EventWithReviews[];
  itineraries: ItineraryWithDays[];
  /** The is_active itinerary, fully expanded (the default view). */
  activeItinerary: ItineraryWithDays | null;
  theme: ThemeRow | null;
}

/* ---- Auth context attached to req.auth by resolveAuth ---- */
export interface AuthContext {
  userId?: string;
  /** When resolved via a viewer share token, the single trip it grants. */
  tripScope?: string;
  role: 'owner' | 'viewer' | 'none';
}
