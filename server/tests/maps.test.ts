import request from 'supertest';
import { normalizeGmapUrl } from '@travel-plan/shared';
import { up as migrate003, down as rollback003 } from '../../migrations/003_fix_gmap_urls';
import {
  makeTestApp,
  destroyTestApp,
  createUser,
  createTrip,
  createEvent,
  sessionCookie,
  type TestCtx,
} from './helpers';

const BROKEN = 'https://www.google.com/maps/place/?q=place_id:ChIJ8Rta7MsBVHkRlOJC-rSP0aQ';
const FIXED_PREFIX = 'https://www.google.com/maps/search/?api=1&query=';

describe('normalizeGmapUrl', () => {
  it('rewrites the mobile-broken place_id form to the Maps URLs API form', () => {
    expect(normalizeGmapUrl(BROKEN, 'Two Step snorkel')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Two%20Step%20snorkel&query_place_id=ChIJ8Rta7MsBVHkRlOJC-rSP0aQ',
    );
  });

  it('matches the non-www host too', () => {
    expect(normalizeGmapUrl('https://google.com/maps/place/?q=place_id:abc123', 'X')).toBe(
      'https://www.google.com/maps/search/?api=1&query=X&query_place_id=abc123',
    );
  });

  it('percent-encodes special characters in the query', () => {
    const out = normalizeGmapUrl(BROKEN, "Puʻuhonua o Hōnaunau (Place of Refuge) — Grandma's pick & more!");
    expect(out).toContain('query=Pu%CA%BBuhonua%20o%20H%C5%8Dnaunau');
    expect(out).toContain('%E2%80%94'); // em-dash
    expect(out).toContain('%26'); // ampersand
    expect(out).toContain('query_place_id=ChIJ8Rta7MsBVHkRlOJC-rSP0aQ');
  });

  it('leaves already-correct and unrelated URLs unchanged', () => {
    const correct = 'https://www.google.com/maps/search/?api=1&query=Kailua-Kona+HI';
    expect(normalizeGmapUrl(correct, 'Kailua')).toBe(correct);
    const share = 'https://maps.app.goo.gl/AbCdEf123';
    expect(normalizeGmapUrl(share, 'Kailua')).toBe(share);
    const other = 'https://example.com/maps/place/?q=place_id:evil';
    expect(normalizeGmapUrl(other, 'Kailua')).toBe(other);
  });

  it('is idempotent', () => {
    const once = normalizeGmapUrl(BROKEN, 'Two Step');
    expect(normalizeGmapUrl(once, 'Two Step')).toBe(once);
  });

  it('returns empty string for missing urls', () => {
    expect(normalizeGmapUrl('', 'X')).toBe('');
    expect(normalizeGmapUrl(null, 'X')).toBe('');
    expect(normalizeGmapUrl(undefined, 'X')).toBe('');
  });

  it('leaves a broken url unchanged when there is no query to fall back on', () => {
    expect(normalizeGmapUrl(BROKEN, '  ')).toBe(BROKEN);
  });
});

describe('migration 003 (rewrite existing gmap_url rows)', () => {
  let ctx: TestCtx;
  let brokenId: string;
  let correctId: string;
  let emptyId: string;
  const CORRECT = 'https://www.google.com/maps/search/?api=1&query=Kailua-Kona+HI';

  beforeAll(async () => {
    ctx = await makeTestApp();
    const user = await createUser(ctx.db);
    const { tripId } = await createTrip(ctx.db, user.id);
    brokenId = await createEvent(ctx.db, tripId, { name: 'Two Step snorkel' });
    correctId = await createEvent(ctx.db, tripId, { name: 'Kailua town' });
    emptyId = await createEvent(ctx.db, tripId, { name: 'No map' });
    await ctx.db('events').where({ id: brokenId }).update({ gmap_url: BROKEN });
    await ctx.db('events').where({ id: correctId }).update({ gmap_url: CORRECT });
  });
  afterAll(() => destroyTestApp(ctx));

  it('up() rewrites only broken rows, using the row name as query', async () => {
    await migrate003(ctx.db);
    const broken = await ctx.db('events').where({ id: brokenId }).first();
    expect(broken.gmap_url).toBe(
      'https://www.google.com/maps/search/?api=1&query=Two%20Step%20snorkel&query_place_id=ChIJ8Rta7MsBVHkRlOJC-rSP0aQ',
    );
    const correct = await ctx.db('events').where({ id: correctId }).first();
    expect(correct.gmap_url).toBe(CORRECT);
    const empty = await ctx.db('events').where({ id: emptyId }).first();
    expect(empty.gmap_url).toBe('');
  });

  it('down() restores the place_id form and leaves query-only URLs alone', async () => {
    await rollback003(ctx.db);
    const broken = await ctx.db('events').where({ id: brokenId }).first();
    expect(broken.gmap_url).toBe(BROKEN);
    const correct = await ctx.db('events').where({ id: correctId }).first();
    expect(correct.gmap_url).toBe(CORRECT);
  });
});

describe('gmap_url normalization on write (events + lodging routes)', () => {
  let ctx: TestCtx;
  let cookie: string;
  let tripId: string;

  beforeAll(async () => {
    ctx = await makeTestApp();
    const user = await createUser(ctx.db);
    cookie = sessionCookie(user.id);
    ({ tripId } = await createTrip(ctx.db, user.id));
  });
  afterAll(() => destroyTestApp(ctx));

  it('normalizes a broken gmap_url on event create', async () => {
    const res = await request(ctx.app)
      .post(`/api/trips/${tripId}/events`)
      .set('Cookie', cookie)
      .send({ slug: 'two_step', name: 'Two Step snorkel', gmap_url: BROKEN });
    expect(res.status).toBe(201);
    expect(res.body.gmap_url).toBe(
      'https://www.google.com/maps/search/?api=1&query=Two%20Step%20snorkel&query_place_id=ChIJ8Rta7MsBVHkRlOJC-rSP0aQ',
    );
  });

  it('normalizes on event patch using the stored name when none is sent', async () => {
    const id = await createEvent(ctx.db, tripId, { name: 'Kahaluʻu Beach' });
    const res = await request(ctx.app)
      .patch(`/api/events/${id}`)
      .set('Cookie', cookie)
      .send({ gmap_url: BROKEN });
    expect(res.status).toBe(200);
    expect(res.body.gmap_url).toBe(
      `${FIXED_PREFIX}Kahalu%CA%BBu%20Beach&query_place_id=ChIJ8Rta7MsBVHkRlOJC-rSP0aQ`,
    );
  });

  it('normalizes lodging using the address as the query', async () => {
    const res = await request(ctx.app)
      .post(`/api/trips/${tripId}/lodging`)
      .set('Cookie', cookie)
      .send({ name: 'Our house', address: 'Opihihale, South Kona', gmap_url: BROKEN });
    expect(res.status).toBe(201);
    expect(res.body.gmap_url).toBe(
      `${FIXED_PREFIX}Opihihale%2C%20South%20Kona&query_place_id=ChIJ8Rta7MsBVHkRlOJC-rSP0aQ`,
    );
  });
});
