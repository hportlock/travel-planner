import request from 'supertest';
import { makeTestApp, destroyTestApp, createUser, createTrip, type TestCtx } from './helpers';

// Mock the Google verifier so no network/credential is needed.
jest.mock('../src/auth/google', () => ({
  verifyGoogleIdToken: jest.fn(async (credential: string) => {
    if (credential === 'good') {
      return { sub: 'google-sub-123', email: 'host@example.com', email_verified: true, name: 'Host', picture: 'http://x/a.png' };
    }
    if (credential === 'unverified') {
      return { sub: 'google-sub-unv', email: 'host@example.com', email_verified: false, name: 'Host', picture: null };
    }
    throw new Error('invalid token');
  }),
}));

let ctx: TestCtx;

beforeAll(async () => {
  ctx = await makeTestApp();
});
afterAll(() => destroyTestApp(ctx));

describe('Google login handler (mocked verifier)', () => {
  it('upserts a user and issues a session cookie', async () => {
    const agent = request.agent(ctx.app);
    const res = await agent.post('/api/auth/google').send({ credential: 'good' });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('host@example.com');
    const setCookie = res.headers['set-cookie'];
    expect(String(setCookie)).toContain('tp_session=');

    // the agent now carries the cookie -> /me resolves the user
    const me = await agent.get('/api/auth/me');
    expect(me.body.user.email).toBe('host@example.com');
  });

  it('does not create a duplicate user on second login', async () => {
    await request(ctx.app).post('/api/auth/google').send({ credential: 'good' });
    const count = await ctx.db('users').where({ google_sub: 'google-sub-123' }).count('* as c').first();
    expect(Number(count?.c)).toBe(1);
  });

  it('rejects an invalid credential with 401', async () => {
    const res = await request(ctx.app).post('/api/auth/google').send({ credential: 'bad' });
    expect(res.status).toBe(401);
  });

  it('exposes the Google client id via /api/config', async () => {
    const res = await request(ctx.app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.googleClientId).toBe(process.env.GOOGLE_CLIENT_ID ?? null);
  });

  it('logout clears the session', async () => {
    const agent = request.agent(ctx.app);
    await agent.post('/api/auth/google').send({ credential: 'good' });
    const out = await agent.post('/api/auth/logout');
    expect(out.body.ok).toBe(true);
  });
});

describe('Google login — claims a seeded owner by verified email', () => {
  // Fresh DB per test so the seed-vs-real user state is isolated.
  let c: TestCtx;
  beforeEach(async () => {
    c = await makeTestApp();
  });
  afterEach(() => destroyTestApp(c));

  it('adopts the seed placeholder (no duplicate) and keeps the trip owned by it', async () => {
    const seed = await createUser(c.db, { google_sub: 'seed-abc', email: 'host@example.com', name: 'Seed Owner' });
    const { tripId } = await createTrip(c.db, seed.id);

    const res = await request(c.app).post('/api/auth/google').send({ credential: 'good' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(seed.id); // same row, now the real account
    expect(res.body.email).toBe('host@example.com');

    const rows = await c.db('users').where({ email: 'host@example.com' });
    expect(rows).toHaveLength(1); // no duplicate user
    expect(rows[0].id).toBe(seed.id);
    expect(rows[0].google_sub).toBe('google-sub-123'); // claimed

    const trip = await c.db('trips').where({ id: tripId }).first();
    expect(trip.owner_id).toBe(seed.id); // ownership transfers to the logged-in account
  });

  it('does not claim when the email is unverified (creates a separate user)', async () => {
    const seed = await createUser(c.db, { google_sub: 'seed-def', email: 'host@example.com' });

    const res = await request(c.app).post('/api/auth/google').send({ credential: 'unverified' });
    expect(res.status).toBe(200);
    expect(res.body.id).not.toBe(seed.id);

    const rows = await c.db('users').where({ email: 'host@example.com' });
    expect(rows).toHaveLength(2); // seed placeholder + new real user
    const stillSeed = await c.db('users').where({ id: seed.id }).first();
    expect(stillSeed.google_sub).toBe('seed-def'); // untouched
  });
});
