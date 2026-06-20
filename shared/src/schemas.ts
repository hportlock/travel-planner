import { z } from 'zod';

/* ============================================================
 * Primitives
 * ========================================================== */

/** App-generated UUID string (crypto.randomUUID()). */
export const uuid = z.string().uuid();

/** Calendar date as YYYY-MM-DD (no time, no tz). */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/** Wall-clock time of day as HH:MM (24h, zero-padded). Never tz-converted. */
export const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM 24-hour');

/** IANA timezone string, e.g. "Pacific/Honolulu". Loosely validated. */
export const timezone = z
  .string()
  .min(1)
  .regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/, 'expected an IANA timezone like Area/Location');

/**
 * Coarse time-of-day bucket — the ordering/grouping fallback when no precise
 * time exists. The free-form source label is dropped in favor of this enum.
 */
export const TIME_OF_DAY = ['morning', 'midday', 'afternoon', 'evening', 'night'] as const;
export const timeOfDay = z.enum(TIME_OF_DAY);

/* ============================================================
 * Regions (trips.regions json: { key: { label, color } })
 * ========================================================== */

export const regionDef = z.object({
  label: z.string().min(1),
  color: z.string().min(1),
});
export const regionsMap = z.record(z.string(), regionDef);

/* ============================================================
 * Trip
 * ========================================================== */

export const tripCreate = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional().default(''),
  destination: z.string().optional().default(''),
  timezone: timezone,
  start_date: isoDate.nullable().optional(),
  end_date: isoDate.nullable().optional(),
  party: z.string().optional().default(''),
  regions: regionsMap.optional().default({}),
});
export const tripUpdate = tripCreate.partial();

/* ============================================================
 * Trip access (read-only share link)
 * ========================================================== */

export const shareCreate = z.object({
  label: z.string().optional().default(''),
});

/* ============================================================
 * Lodging
 * ========================================================== */

export const lodgingCreate = z.object({
  name: z.string().min(1),
  address: z.string().optional().default(''),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  gmap_url: z.string().optional().default(''),
  check_in: isoDate.nullable().optional(),
  check_out: isoDate.nullable().optional(),
  cost: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  is_home_base: z.boolean().optional().default(false),
});
export const lodgingUpdate = lodgingCreate.partial();

/* ============================================================
 * Event (the activity catalog / ACT)
 * ========================================================== */

export const eventCreate = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9_]+$/, 'slug must be lower snake_case'),
  name: z.string().min(1),
  emoji: z.string().optional().default(''),
  region: z.string().optional().default(''),
  url: z.string().optional().default(''),
  gmap_url: z.string().optional().default(''),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  drive: z.string().optional().default(''),
  cost: z.string().optional().default(''),
  ages: z.string().optional().default(''),
  booking: z.string().optional().default(''),
  meal: z.string().nullable().optional(),
  rating: z.string().nullable().optional(),
  blurb: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
});
export const eventUpdate = eventCreate.partial();

export const reviewCreate = z.object({
  quote: z.string().min(1),
  who: z.string().optional().default(''),
  stars: z.number().int().min(0).max(5).optional().default(5),
  position: z.number().int().optional(),
});
export const reviewUpdate = reviewCreate.partial();

/* ============================================================
 * Itinerary (PLANS variant) + days + day_items
 * ========================================================== */

export const itineraryCreate = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  vibe: z.string().optional().default(''),
  position: z.number().int().optional(),
  is_active: z.boolean().optional(),
});
export const itineraryUpdate = itineraryCreate.partial();

export const dayCreate = z.object({
  position: z.number().int().optional(),
  dow: z.string().optional().default(''),
  date_label: z.string().optional().default(''),
  date: isoDate.nullable().optional(),
  flag: z.string().optional().default(''),
  flag_color: z.string().optional().default(''),
  drive: z.string().optional().default(''),
  note: z.string().optional().default(''),
});
export const dayUpdate = dayCreate.partial();

/**
 * A day_item must have a precise start_time(-end_time), OR a time_of_day
 * bucket, OR neither. end_time without start_time is rejected.
 */
export const dayItemCreate = z
  .object({
    event_id: uuid,
    position: z.number().int().optional(),
    start_time: hhmm.nullable().optional(),
    end_time: hhmm.nullable().optional(),
    time_of_day: timeOfDay.nullable().optional(),
    note: z.string().optional().default(''),
  })
  .refine((v) => !(v.end_time && !v.start_time), {
    message: 'end_time requires start_time',
    path: ['end_time'],
  });

export const dayItemUpdate = z
  .object({
    event_id: uuid.optional(),
    position: z.number().int().optional(),
    start_time: hhmm.nullable().optional(),
    end_time: hhmm.nullable().optional(),
    time_of_day: timeOfDay.nullable().optional(),
    note: z.string().optional(),
  })
  .refine((v) => !(v.end_time && !v.start_time), {
    message: 'end_time requires start_time',
    path: ['end_time'],
  });

/** Body for POST /days/:id/reorder — full ordered list of day_item ids. */
export const reorderBody = z.object({
  itemIds: z.array(uuid),
});

/* ============================================================
 * Theming (T1 tokens / T2 layout / T3 custom_css)
 * ========================================================== */

export const fontsSchema = z.object({
  display: z.string().optional().default(''),
  body: z.string().optional().default(''),
  mono: z.string().optional().default(''),
  url: z.string().optional().default(''),
});

export const heroSchema = z.object({
  variant: z.string().optional().default('postcard'),
  gradient: z.string().optional().default(''),
  stamp: z.string().optional().default(''),
  motifs: z.array(z.string()).optional().default([]),
});

/** T1 design tokens — a free-form CSS custom-property map ("--coral" etc). */
export const tokensSchema = z.record(z.string(), z.string());

/* ---- T2 structured layout: app-implemented variants, strict enums ---- */
export const HERO_VARIANTS = ['postcard', 'editorial', 'glass', 'minimal'] as const;
export const DAY_STYLES = ['timeline', 'cards', 'grid'] as const;
export const DENSITIES = ['comfortable', 'compact'] as const;
export const CARD_SHAPES = ['rounded', 'sharp', 'pill'] as const;
export const DECOR_PATTERNS = ['none', 'dots', 'waves', 'tropical'] as const;
export const SECTION_KEYS = ['hero', 'itinerary', 'catalog', 'lodging', 'map'] as const;

export const layoutSchema = z.object({
  heroVariant: z.enum(HERO_VARIANTS).default('postcard'),
  dayStyle: z.enum(DAY_STYLES).default('cards'),
  sectionOrder: z.array(z.enum(SECTION_KEYS)).default([...SECTION_KEYS]),
  sectionVisibility: z.record(z.enum(SECTION_KEYS), z.boolean()).default({}),
  density: z.enum(DENSITIES).default('comfortable'),
  cardShape: z.enum(CARD_SHAPES).default('rounded'),
  showRegionColors: z.boolean().default(true),
  decor: z
    .object({
      pattern: z.enum(DECOR_PATTERNS).default('none'),
      dividers: z.boolean().default(false),
      motifs: z.array(z.string()).default([]),
    })
    .default({ pattern: 'none', dividers: false, motifs: [] }),
});

/** Max bytes for custom_css (size cap enforced on write). */
export const CUSTOM_CSS_MAX_BYTES = 20_000;

export const themeUpsert = z.object({
  name: z.string().min(1).optional().default('Custom'),
  tokens: tokensSchema.optional().default({}),
  fonts: fontsSchema.optional().default({ display: '', body: '', mono: '', url: '' }),
  hero: heroSchema.optional().default({ variant: 'postcard', gradient: '', stamp: '', motifs: [] }),
  layout: layoutSchema.optional(),
  custom_css: z.string().max(CUSTOM_CSS_MAX_BYTES, 'custom_css too large').optional().default(''),
});

/** Focused MCP updates. */
export const setLayoutBody = z.object({ layout: layoutSchema });
export const setCustomCssBody = z.object({
  custom_css: z.string().max(CUSTOM_CSS_MAX_BYTES, 'custom_css too large'),
});

/* ============================================================
 * Auth
 * ========================================================== */

export const googleLoginBody = z.object({
  credential: z.string().min(1), // Google ID token (JWT)
});

export const tokenCreate = z.object({
  label: z.string().optional().default(''),
});
