import type { Express } from 'express';
import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { makeKnex, serializeJson } from '../src/db';
import { createApp } from '../src/app';
import { signSession } from '../src/auth/session';
import { generatePat } from '../src/auth/pat';
import { up as migrate001 } from '../../migrations/001_initial';
import { up as migrate002 } from '../../migrations/002_mcp_oauth';
import { up as migrate003 } from '../../migrations/003_fix_gmap_urls';

export interface TestCtx {
  app: Express;
  db: Knex;
}

/** Fresh in-memory SQLite, migrated, with the app wired to it. One per suite. */
export async function makeTestApp(): Promise<TestCtx> {
  const db = makeKnex('test');
  // mirrors `knex migrate:latest` on a fresh :memory: db
  await migrate001(db);
  await migrate002(db);
  await migrate003(db);
  const app = createApp(db);
  return { app, db };
}

export async function destroyTestApp(ctx: TestCtx): Promise<void> {
  await ctx.db.destroy();
}

const now = () => new Date().toISOString();

export async function createUser(
  db: Knex,
  overrides: Partial<{ id: string; email: string; name: string; google_sub: string }> = {},
): Promise<{ id: string; email: string; name: string }> {
  const id = overrides.id ?? randomUUID();
  const user = {
    id,
    google_sub: overrides.google_sub ?? `sub-${id}`,
    email: overrides.email ?? `${id}@example.com`,
    name: overrides.name ?? 'Test User',
    avatar_url: null,
    created_at: now(),
    updated_at: now(),
  };
  await db('users').insert(user);
  return { id, email: user.email, name: user.name };
}

/** Cookie header value to authenticate as a host user. */
export function sessionCookie(userId: string): string {
  return `tp_session=${signSession(userId)}`;
}

/** Create a PAT for a user and return the plaintext bearer value. */
export async function createPat(db: Knex, userId: string): Promise<string> {
  const { plaintext, hash } = generatePat();
  await db('personal_access_tokens').insert({
    id: randomUUID(),
    user_id: userId,
    token_hash: hash,
    label: 'test',
    last_used_at: null,
    created_at: now(),
    updated_at: now(),
  });
  return plaintext;
}

/** Insert a trip + its single default active itinerary; returns ids. */
export async function createTrip(
  db: Knex,
  ownerId: string,
  overrides: Partial<{ title: string; timezone: string }> = {},
): Promise<{ tripId: string; itineraryId: string }> {
  const tripId = randomUUID();
  const itineraryId = randomUUID();
  await db('trips').insert({
    id: tripId,
    owner_id: ownerId,
    title: overrides.title ?? 'Test Trip',
    subtitle: '',
    destination: '',
    timezone: overrides.timezone ?? 'Pacific/Honolulu',
    start_date: null,
    end_date: null,
    party: '',
    regions: serializeJson({}),
    created_at: now(),
    updated_at: now(),
  });
  await db('itineraries').insert({
    id: itineraryId,
    trip_id: tripId,
    slug: 'main',
    name: 'Itinerary',
    vibe: '',
    position: 0,
    is_active: true,
    created_at: now(),
    updated_at: now(),
  });
  return { tripId, itineraryId };
}

export async function createEvent(
  db: Knex,
  tripId: string,
  overrides: Partial<{ slug: string; name: string; region: string }> = {},
): Promise<string> {
  const id = randomUUID();
  const slug = overrides.slug ?? `ev-${id.slice(0, 8)}`;
  await db('events').insert({
    id,
    trip_id: tripId,
    slug,
    name: overrides.name ?? 'Event',
    emoji: '',
    region: overrides.region ?? '',
    url: '',
    gmap_url: '',
    lat: null,
    lng: null,
    drive: '',
    cost: '',
    ages: '',
    booking: '',
    meal: null,
    rating: null,
    blurb: '',
    tags: serializeJson([]),
    created_at: now(),
    updated_at: now(),
  });
  return id;
}

export async function createDay(db: Knex, itineraryId: string, position = 0): Promise<string> {
  const id = randomUUID();
  await db('days').insert({
    id,
    itinerary_id: itineraryId,
    position,
    dow: '',
    date_label: '',
    date: null,
    flag: '',
    flag_color: '',
    drive: '',
    note: '',
    created_at: now(),
    updated_at: now(),
  });
  return id;
}
