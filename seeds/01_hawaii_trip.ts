import type { Knex } from 'knex';
import { randomUUID, randomBytes } from 'crypto';
import hawaii from './data/hawaii.json';

/**
 * Seeds the Hawaii reference trip — the first real trip, validating the schema
 * against messy real data. Idempotent: wipes and reloads. Prints owner email,
 * trip title, and the read-only share URL.
 */

const j = (v: unknown) => JSON.stringify(v ?? null);
const now = () => new Date().toISOString();

type AnyRow = Record<string, unknown>;

export async function seed(knex: Knex): Promise<void> {
  const data = hawaii as any;

  // ---- wipe (FK-safe order) ----
  await knex('day_items').del();
  await knex('days').del();
  await knex('itineraries').del();
  await knex('reviews').del();
  await knex('events').del();
  await knex('lodging').del();
  await knex('themes').del();
  await knex('trip_access').del();
  await knex('trips').del();
  // Leave users/PATs from prior runs alone except the seed owner.

  const ownerEmail = process.env.SEED_OWNER_EMAIL || 'hportlock@gmail.com';
  const appBase = process.env.APP_BASE_URL || 'http://localhost:5173';

  // ---- owner (upsert by email) ----
  let owner = await knex('users').where({ email: ownerEmail }).first();
  if (!owner) {
    const ownerId = randomUUID();
    owner = {
      id: ownerId,
      google_sub: `seed-${ownerId}`,
      email: ownerEmail,
      name: 'Trip Host',
      avatar_url: null,
      created_at: now(),
      updated_at: now(),
    };
    await knex('users').insert(owner);
  }

  // ---- trip ----
  const tripId = randomUUID();
  const t = data.trip;
  await knex('trips').insert({
    id: tripId,
    owner_id: owner.id,
    title: t.title,
    subtitle: t.subtitle ?? '',
    destination: t.destination ?? '',
    timezone: t.timezone || 'Pacific/Honolulu',
    start_date: t.start_date ?? null,
    end_date: t.end_date ?? null,
    party: t.party ?? '',
    regions: j(t.regions ?? {}),
    created_at: now(),
    updated_at: now(),
  } as AnyRow);

  // ---- share link (read-only viewer) ----
  const shareToken = randomBytes(32).toString('base64url');
  await knex('trip_access').insert({
    id: randomUUID(),
    trip_id: tripId,
    role: 'viewer',
    token: shareToken,
    label: 'Family viewers',
    created_at: now(),
    updated_at: now(),
  } as AnyRow);

  // ---- lodging ----
  for (const l of data.lodging ?? []) {
    await knex('lodging').insert({
      id: randomUUID(),
      trip_id: tripId,
      name: l.name,
      address: l.address ?? '',
      lat: l.lat ?? null,
      lng: l.lng ?? null,
      gmap_url: l.gmap_url ?? '',
      check_in: l.check_in ?? null,
      check_out: l.check_out ?? null,
      cost: l.cost ?? '',
      notes: l.notes ?? '',
      is_home_base: !!l.is_home_base,
      created_at: now(),
      updated_at: now(),
    } as AnyRow);
  }

  // ---- events (+reviews); build slug -> id map ----
  const eventIdBySlug = new Map<string, string>();
  for (const e of data.events ?? []) {
    const eventId = randomUUID();
    eventIdBySlug.set(e.slug, eventId);
    await knex('events').insert({
      id: eventId,
      trip_id: tripId,
      slug: e.slug,
      name: e.name,
      emoji: e.emoji ?? '',
      region: e.region ?? '',
      url: e.url ?? '',
      gmap_url: e.gmap_url ?? '',
      lat: e.lat ?? null,
      lng: e.lng ?? null,
      drive: e.drive ?? '',
      cost: e.cost ?? '',
      ages: e.ages ?? '',
      booking: e.booking ?? '',
      meal: e.meal ?? null,
      rating: e.rating ?? null,
      blurb: e.blurb ?? '',
      tags: j(e.tags ?? []),
      created_at: now(),
      updated_at: now(),
    } as AnyRow);

    let rpos = 0;
    for (const r of e.reviews ?? []) {
      await knex('reviews').insert({
        id: randomUUID(),
        event_id: eventId,
        quote: r.quote,
        who: r.who ?? '',
        stars: typeof r.stars === 'number' ? r.stars : 5,
        position: rpos++,
        created_at: now(),
        updated_at: now(),
      } as AnyRow);
    }
  }

  // ---- itineraries (+days +items) ----
  for (const it of data.itineraries ?? []) {
    const itineraryId = randomUUID();
    await knex('itineraries').insert({
      id: itineraryId,
      trip_id: tripId,
      slug: it.slug,
      name: it.name,
      vibe: it.vibe ?? '',
      position: it.position ?? 0,
      is_active: !!it.is_active,
      created_at: now(),
      updated_at: now(),
    } as AnyRow);

    for (const d of it.days ?? []) {
      const dayId = randomUUID();
      await knex('days').insert({
        id: dayId,
        itinerary_id: itineraryId,
        position: d.position ?? 0,
        dow: d.dow ?? '',
        date_label: d.date_label ?? '',
        date: d.date ?? null,
        flag: d.flag ?? '',
        flag_color: d.flag_color ?? '',
        drive: d.drive ?? '',
        note: d.note ?? '',
        created_at: now(),
        updated_at: now(),
      } as AnyRow);

      let ipos = 0;
      for (const item of d.items ?? []) {
        const eventId = eventIdBySlug.get(item.event_slug);
        if (!eventId) {
          // Skip placements that reference an unknown slug rather than crash.
          // (None expected — surfaces data drift loudly in the log.)
          console.warn(`[seed] unknown event_slug "${item.event_slug}" in ${it.slug}`);
          continue;
        }
        await knex('day_items').insert({
          id: randomUUID(),
          day_id: dayId,
          event_id: eventId,
          position: ipos++,
          start_time: item.start_time ?? null,
          end_time: item.end_time ?? null,
          time_of_day: item.time_of_day ?? null,
          note: item.note ?? '',
          created_at: now(),
          updated_at: now(),
        } as AnyRow);
      }
    }
  }

  // ---- active theme (tropical postcard redesign) ----
  await knex('themes').insert({
    id: randomUUID(),
    trip_id: tripId,
    name: 'Tropical Postcard',
    is_active: true,
    tokens: j({
      '--coral': '#ff8a5b',
      '--pink': '#ff5e9c',
      '--grape': '#9b6fe0',
      '--ocean': '#11b0a6',
      '--ocean-deep': '#0e7e9c',
      '--gold': '#ffb23e',
      '--ember': '#e5572c',
      '--bg': '#fbf1dd',
      '--ink': '#33271c',
      '--sunset': 'linear-gradient(118deg,#ffb35c 0%,#ff7e64 26%,#ff5e9c 60%,#9b6fe0 100%)',
      '--radius': '18px',
    }),
    fonts: j({
      display: 'Manrope',
      body: 'Figtree',
      mono: 'Space Mono',
      url: 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;800&family=Manrope:wght@600;800&family=Space+Mono:wght@400;700&display=swap',
    }),
    hero: j({
      variant: 'postcard',
      gradient: 'linear-gradient(118deg,#ffb35c,#ff7e64,#ff5e9c)',
      stamp: '🌺',
      motifs: ['🌺', '🌋', '🐢'],
    }),
    layout: j({
      heroVariant: 'postcard',
      dayStyle: 'cards',
      sectionOrder: ['hero', 'itinerary', 'catalog', 'lodging', 'map'],
      sectionVisibility: { hero: true, itinerary: true, catalog: true, lodging: true, map: true },
      density: 'comfortable',
      cardShape: 'rounded',
      showRegionColors: true,
      decor: { pattern: 'dots', dividers: true, motifs: ['🌺'] },
    }),
    custom_css: [
      '#trip-root { background:',
      '  radial-gradient(circle at 1px 1px, rgba(180,140,90,.16) 1.4px, transparent 0) 0 0/22px 22px,',
      '  var(--bg); }',
      '#trip-root .tp-hero { background:#f47a5b; color:#fff; border:3px solid #fff;',
      '  outline:2px dashed rgba(255,255,255,.55); outline-offset:-9px; border-radius:20px; }',
      '#trip-root .tp-day { background:#fff; border:2px solid #e7d6ba; border-radius:18px; }',
      '#trip-root .tp-day-head { background:#f8825f; color:#fff; }',
      '#trip-root .tp-activity .tp-activity-emoji { transform:rotate(-3deg); }',
      '#trip-root .tp-activity[data-tag="booked"] { border-color:#1f7a47; }',
    ].join('\n'),
    created_at: now(),
    updated_at: now(),
  } as AnyRow);

  // ---- report ----
  const shareUrl = `${appBase}/t/${shareToken}`;
  // eslint-disable-next-line no-console
  console.log('\n=== Hawaii trip seeded ===');
  console.log(`owner:   ${ownerEmail}`);
  console.log(`trip:    ${t.title} (${tripId})`);
  console.log(`events:  ${(data.events ?? []).length}`);
  console.log(`plans:   ${(data.itineraries ?? []).map((i: any) => i.slug).join(', ')}`);
  console.log(`share:   ${shareUrl}`);
  console.log('==========================\n');
}
