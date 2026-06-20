import type {
  TripRow,
  LodgingRow,
  EventRow,
  ReviewRow,
  ItineraryRow,
  DayRow,
  DayItemRow,
  ThemeRow,
  RegionsMap,
  LayoutConfig,
  Fonts,
  Hero,
} from '@travel-plan/shared';
import { parseJson, toBool } from '../db';

export function mapTrip(r: any): TripRow {
  return {
    id: r.id,
    owner_id: r.owner_id,
    title: r.title,
    subtitle: r.subtitle ?? '',
    destination: r.destination ?? '',
    timezone: r.timezone,
    start_date: r.start_date ?? null,
    end_date: r.end_date ?? null,
    party: r.party ?? '',
    regions: parseJson<RegionsMap>(r.regions, {}),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function mapLodging(r: any): LodgingRow {
  return {
    id: r.id,
    trip_id: r.trip_id,
    name: r.name,
    address: r.address ?? '',
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    gmap_url: r.gmap_url ?? '',
    check_in: r.check_in ?? null,
    check_out: r.check_out ?? null,
    cost: r.cost ?? '',
    notes: r.notes ?? '',
    is_home_base: toBool(r.is_home_base),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function mapEvent(r: any): EventRow {
  return {
    id: r.id,
    trip_id: r.trip_id,
    slug: r.slug,
    name: r.name,
    emoji: r.emoji ?? '',
    region: r.region ?? '',
    url: r.url ?? '',
    gmap_url: r.gmap_url ?? '',
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    drive: r.drive ?? '',
    cost: r.cost ?? '',
    ages: r.ages ?? '',
    booking: r.booking ?? '',
    meal: r.meal ?? null,
    rating: r.rating ?? null,
    blurb: r.blurb ?? '',
    tags: parseJson<string[]>(r.tags, []),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function mapReview(r: any): ReviewRow {
  return {
    id: r.id,
    event_id: r.event_id,
    quote: r.quote,
    who: r.who ?? '',
    stars: Number(r.stars ?? 5),
    position: Number(r.position ?? 0),
  };
}

export function mapItinerary(r: any): ItineraryRow {
  return {
    id: r.id,
    trip_id: r.trip_id,
    slug: r.slug,
    name: r.name,
    vibe: r.vibe ?? '',
    position: Number(r.position ?? 0),
    is_active: toBool(r.is_active),
  };
}

export function mapDay(r: any): DayRow {
  return {
    id: r.id,
    itinerary_id: r.itinerary_id,
    position: Number(r.position ?? 0),
    dow: r.dow ?? '',
    date_label: r.date_label ?? '',
    date: r.date ?? null,
    flag: r.flag ?? '',
    flag_color: r.flag_color ?? '',
    drive: r.drive ?? '',
    note: r.note ?? '',
  };
}

export function mapDayItem(r: any): DayItemRow {
  return {
    id: r.id,
    day_id: r.day_id,
    event_id: r.event_id,
    position: Number(r.position ?? 0),
    start_time: r.start_time ?? null,
    end_time: r.end_time ?? null,
    time_of_day: r.time_of_day ?? null,
    note: r.note ?? '',
  };
}

export function mapTheme(r: any): ThemeRow {
  return {
    id: r.id,
    trip_id: r.trip_id,
    name: r.name ?? 'Custom',
    is_active: toBool(r.is_active),
    tokens: parseJson<Record<string, string>>(r.tokens, {}),
    fonts: parseJson<Fonts>(r.fonts, { display: '', body: '', mono: '', url: '' }),
    hero: parseJson<Hero>(r.hero, { variant: 'postcard', gradient: '', stamp: '', motifs: [] }),
    layout: r.layout != null ? parseJson<LayoutConfig | null>(r.layout, null) : null,
    custom_css: r.custom_css ?? '',
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
