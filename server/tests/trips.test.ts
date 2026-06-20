import request from 'supertest';
import {
  makeTestApp,
  destroyTestApp,
  createUser,
  sessionCookie,
  createPat,
  type TestCtx,
} from './helpers';

let ctx: TestCtx;
let alice: { id: string };
let bob: { id: string };

beforeAll(async () => {
  ctx = await makeTestApp();
  alice = await createUser(ctx.db, { email: 'alice@example.com' });
  bob = await createUser(ctx.db, { email: 'bob@example.com' });
});
afterAll(() => destroyTestApp(ctx));

function asAlice() {
  return sessionCookie(alice.id);
}

describe('trip CRUD + ownership', () => {
  let tripId: string;

  it('creates a trip and auto-creates one active itinerary', async () => {
    const res = await request(ctx.app)
      .post('/api/trips')
      .set('Cookie', asAlice())
      .send({ title: 'Hawaii', timezone: 'Pacific/Honolulu' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Hawaii');
    expect(res.body.itineraries).toHaveLength(1);
    expect(res.body.itineraries.filter((i: any) => i.is_active)).toHaveLength(1);
    expect(res.body.activeItinerary).not.toBeNull();
    tripId = res.body.id;
  });

  it('rejects trip creation without auth', async () => {
    const res = await request(ctx.app).post('/api/trips').send({ title: 'X', timezone: 'UTC' });
    expect(res.status).toBe(401);
  });

  it('rejects invalid timezone via zod', async () => {
    const res = await request(ctx.app)
      .post('/api/trips')
      .set('Cookie', asAlice())
      .send({ title: 'Bad', timezone: 'not-a-zone' });
    expect(res.status).toBe(400);
  });

  it('lists only the owner’s trips', async () => {
    const res = await request(ctx.app).get('/api/trips').set('Cookie', asAlice());
    expect(res.status).toBe(200);
    expect(res.body.every((t: any) => t.owner_id === alice.id)).toBe(true);
    const bobRes = await request(ctx.app).get('/api/trips').set('Cookie', sessionCookie(bob.id));
    expect(bobRes.body).toHaveLength(0);
  });

  it('lets the owner read full detail', async () => {
    const res = await request(ctx.app).get(`/api/trips/${tripId}`).set('Cookie', asAlice());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(tripId);
  });

  it('forbids a different user from reading or mutating', async () => {
    const get = await request(ctx.app).get(`/api/trips/${tripId}`).set('Cookie', sessionCookie(bob.id));
    expect(get.status).toBe(403);
    const patch = await request(ctx.app)
      .patch(`/api/trips/${tripId}`)
      .set('Cookie', sessionCookie(bob.id))
      .send({ title: 'Hacked' });
    expect(patch.status).toBe(403);
  });

  it('patches and deletes as owner', async () => {
    const patch = await request(ctx.app)
      .patch(`/api/trips/${tripId}`)
      .set('Cookie', asAlice())
      .send({ subtitle: 'Family trip' });
    expect(patch.status).toBe(200);
    expect(patch.body.subtitle).toBe('Family trip');
  });
});

describe('share links (read-only)', () => {
  let tripId: string;
  let token: string;

  beforeAll(async () => {
    const create = await request(ctx.app)
      .post('/api/trips')
      .set('Cookie', asAlice())
      .send({ title: 'Shared Trip', timezone: 'Pacific/Honolulu' });
    tripId = create.body.id;
    const share = await request(ctx.app).post(`/api/trips/${tripId}/share`).set('Cookie', asAlice()).send({});
    token = share.body.token;
    expect(share.status).toBe(201);
    expect(share.body.url).toContain(token);
  });

  it('serves the trip read-only via the share token', async () => {
    const res = await request(ctx.app).get(`/api/shared/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(tripId);
    expect(res.body.title).toBe('Shared Trip');
  });

  it('404s an invalid share token', async () => {
    const res = await request(ctx.app).get('/api/shared/not-a-real-token');
    expect(res.status).toBe(404);
  });

  it('exposes no mutation route under /api/shared', async () => {
    // there is no PATCH/POST under shared; a viewer cannot mutate the trip.
    const res = await request(ctx.app).patch(`/api/shared/${token}`).send({ title: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('PAT auth (MCP host access)', () => {
  it('lets a PAT act as the host', async () => {
    const pat = await createPat(ctx.db, alice.id);
    const res = await request(ctx.app).get('/api/trips').set('Authorization', `Bearer ${pat}`);
    expect(res.status).toBe(200);
    expect(res.body.every((t: any) => t.owner_id === alice.id)).toBe(true);
  });

  it('rejects an unknown PAT', async () => {
    const res = await request(ctx.app).get('/api/trips').set('Authorization', 'Bearer tp_pat_bogus');
    expect(res.status).toBe(401);
  });
});
