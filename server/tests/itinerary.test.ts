import request from 'supertest';
import {
  makeTestApp,
  destroyTestApp,
  createUser,
  sessionCookie,
  createTrip,
  createEvent,
  type TestCtx,
} from './helpers';

let ctx: TestCtx;
let alice: { id: string };
let bob: { id: string };

beforeAll(async () => {
  ctx = await makeTestApp();
  alice = await createUser(ctx.db, { email: 'a@example.com' });
  bob = await createUser(ctx.db, { email: 'b@example.com' });
});
afterAll(() => destroyTestApp(ctx));

const cookieA = () => sessionCookie(alice.id);

describe('day_items reorder', () => {
  it('reorders items and persists positions', async () => {
    const { tripId, itineraryId } = await createTrip(ctx.db, alice.id);
    const e1 = await createEvent(ctx.db, tripId, { slug: 'r1' });
    const e2 = await createEvent(ctx.db, tripId, { slug: 'r2' });
    const e3 = await createEvent(ctx.db, tripId, { slug: 'r3' });
    const d = await request(ctx.app).post(`/api/itineraries/${itineraryId}/days`).set('Cookie', cookieA()).send({});
    const did = d.body.id;
    const i1 = (await request(ctx.app).post(`/api/days/${did}/items`).set('Cookie', cookieA()).send({ event_id: e1 })).body;
    const i2 = (await request(ctx.app).post(`/api/days/${did}/items`).set('Cookie', cookieA()).send({ event_id: e2 })).body;
    const i3 = (await request(ctx.app).post(`/api/days/${did}/items`).set('Cookie', cookieA()).send({ event_id: e3 })).body;

    const res = await request(ctx.app)
      .post(`/api/days/${did}/reorder`)
      .set('Cookie', cookieA())
      .send({ itemIds: [i3.id, i1.id, i2.id] });
    expect(res.status).toBe(200);
    expect(res.body.map((x: any) => x.id)).toEqual([i3.id, i1.id, i2.id]);
    expect(res.body.map((x: any) => x.position)).toEqual([0, 1, 2]);
  });

  it('rejects a reorder list that is not exactly the current items', async () => {
    const { tripId, itineraryId } = await createTrip(ctx.db, alice.id, { title: 'T2' });
    const e1 = await createEvent(ctx.db, tripId, { slug: 'z1' });
    const d = await request(ctx.app).post(`/api/itineraries/${itineraryId}/days`).set('Cookie', cookieA()).send({});
    const did = d.body.id;
    const i1 = (await request(ctx.app).post(`/api/days/${did}/items`).set('Cookie', cookieA()).send({ event_id: e1 })).body;
    const res = await request(ctx.app)
      .post(`/api/days/${did}/reorder`)
      .set('Cookie', cookieA())
      .send({ itemIds: [i1.id, 'extra-id'] });
    expect(res.status).toBe(400);
  });
});

describe('itinerary active invariant', () => {
  it('keeps exactly one active itinerary after activate', async () => {
    const { tripId } = await createTrip(ctx.db, alice.id, { title: 'Variants' });
    const second = await request(ctx.app)
      .post(`/api/trips/${tripId}/itineraries`)
      .set('Cookie', cookieA())
      .send({ slug: 'rainy', name: 'Rainy day' });
    expect(second.status).toBe(201);
    expect(second.body.is_active).toBe(false);

    const activate = await request(ctx.app)
      .post(`/api/itineraries/${second.body.id}/activate`)
      .set('Cookie', cookieA())
      .send({});
    expect(activate.status).toBe(200);

    const list = await request(ctx.app).get(`/api/trips/${tripId}/itineraries`).set('Cookie', cookieA());
    expect(list.body.filter((i: any) => i.is_active)).toHaveLength(1);
    expect(list.body.find((i: any) => i.is_active).id).toBe(second.body.id);
  });

  it('duplicates an itinerary with its days and items', async () => {
    const { tripId, itineraryId } = await createTrip(ctx.db, alice.id, { title: 'Dup' });
    const e1 = await createEvent(ctx.db, tripId, { slug: 'd1' });
    const d = await request(ctx.app).post(`/api/itineraries/${itineraryId}/days`).set('Cookie', cookieA()).send({ dow: 'Wed' });
    await request(ctx.app).post(`/api/days/${d.body.id}/items`).set('Cookie', cookieA()).send({ event_id: e1, time_of_day: 'midday' });

    const dup = await request(ctx.app).post(`/api/itineraries/${itineraryId}/duplicate`).set('Cookie', cookieA()).send({});
    expect(dup.status).toBe(201);
    expect(dup.body.is_active).toBe(false);

    const days = await request(ctx.app).get(`/api/itineraries/${dup.body.id}/days`).set('Cookie', cookieA());
    expect(days.body).toHaveLength(1);
    const items = await request(ctx.app).get(`/api/days/${days.body[0].id}/items`).set('Cookie', cookieA());
    expect(items.body).toHaveLength(1);
    expect(items.body[0].time_of_day).toBe('midday');
  });
});

describe('cross-trip boundaries on nested resources', () => {
  it('forbids a non-owner from adding a day to someone else’s itinerary', async () => {
    const { itineraryId } = await createTrip(ctx.db, alice.id, { title: 'Private' });
    const res = await request(ctx.app)
      .post(`/api/itineraries/${itineraryId}/days`)
      .set('Cookie', sessionCookie(bob.id))
      .send({ dow: 'Mon' });
    expect(res.status).toBe(403);
  });

  it('rejects a day_item whose event belongs to another trip', async () => {
    const a = await createTrip(ctx.db, alice.id, { title: 'A' });
    const b = await createTrip(ctx.db, alice.id, { title: 'B' });
    const foreignEvent = await createEvent(ctx.db, b.tripId, { slug: 'foreign' });
    const d = await request(ctx.app).post(`/api/itineraries/${a.itineraryId}/days`).set('Cookie', cookieA()).send({});
    const res = await request(ctx.app)
      .post(`/api/days/${d.body.id}/items`)
      .set('Cookie', cookieA())
      .send({ event_id: foreignEvent });
    expect(res.status).toBe(400);
  });
});
