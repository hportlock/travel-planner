import request from 'supertest';
import { sortDayItems } from '@travel-plan/shared';
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
let userId: string;

beforeAll(async () => {
  ctx = await makeTestApp();
  userId = (await createUser(ctx.db)).id;
});
afterAll(() => destroyTestApp(ctx));

describe('sortDayItems (pure rule)', () => {
  it('interleaves timed items and buckets by nominal minute', () => {
    const items = [
      { id: 'a', start_time: '14:00', time_of_day: null, position: 0 },
      { id: 'b', start_time: null, time_of_day: 'morning' as const, position: 1 },
      { id: 'c', start_time: '08:00', time_of_day: null, position: 2 },
      { id: 'd', start_time: null, time_of_day: 'night' as const, position: 3 },
      { id: 'e', start_time: null, time_of_day: null, position: 4 },
    ];
    const order = sortDayItems(items).map((x) => x.id);
    expect(order).toEqual(['c', 'b', 'a', 'd', 'e']);
  });

  it('breaks ties by position', () => {
    const items = [
      { id: 'x', start_time: null, time_of_day: 'morning' as const, position: 5 },
      { id: 'y', start_time: null, time_of_day: 'morning' as const, position: 1 },
    ];
    expect(sortDayItems(items).map((x) => x.id)).toEqual(['y', 'x']);
  });
});

describe('day_item time model over the API', () => {
  let dayId: string;
  let evTimed: string;
  let evBucket: string;
  const cookie = () => sessionCookie(userId);

  beforeAll(async () => {
    const { tripId, itineraryId } = await createTrip(ctx.db, userId);
    evTimed = await createEvent(ctx.db, tripId, { slug: 'timed' });
    evBucket = await createEvent(ctx.db, tripId, { slug: 'bucket' });
    const dayRes = await request(ctx.app)
      .post(`/api/itineraries/${itineraryId}/days`)
      .set('Cookie', cookie())
      .send({ dow: 'Mon', date_label: 'Day 1' });
    dayId = dayRes.body.id;
  });

  it('stores and returns wall-clock HH:MM unchanged', async () => {
    const res = await request(ctx.app)
      .post(`/api/days/${dayId}/items`)
      .set('Cookie', cookie())
      .send({ event_id: evTimed, start_time: '17:30', end_time: '20:30' });
    expect(res.status).toBe(201);
    expect(res.body.start_time).toBe('17:30');
    expect(res.body.end_time).toBe('20:30');
  });

  it('accepts a time_of_day bucket', async () => {
    const res = await request(ctx.app)
      .post(`/api/days/${dayId}/items`)
      .set('Cookie', cookie())
      .send({ event_id: evBucket, time_of_day: 'morning' });
    expect(res.status).toBe(201);
    expect(res.body.time_of_day).toBe('morning');
  });

  it('rejects an invalid HH:MM', async () => {
    const res = await request(ctx.app)
      .post(`/api/days/${dayId}/items`)
      .set('Cookie', cookie())
      .send({ event_id: evTimed, start_time: '25:61' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown time_of_day enum', async () => {
    const res = await request(ctx.app)
      .post(`/api/days/${dayId}/items`)
      .set('Cookie', cookie())
      .send({ event_id: evTimed, time_of_day: 'lunchtime' });
    expect(res.status).toBe(400);
  });

  it('rejects end_time without start_time', async () => {
    const res = await request(ctx.app)
      .post(`/api/days/${dayId}/items`)
      .set('Cookie', cookie())
      .send({ event_id: evTimed, end_time: '20:30' });
    expect(res.status).toBe(400);
  });

  it('returns items in deterministic order in the trip detail', async () => {
    const { tripId, itineraryId } = await createTrip(ctx.db, userId, { title: 'Order Trip' });
    const e1 = await createEvent(ctx.db, tripId, { slug: 'e1' });
    const e2 = await createEvent(ctx.db, tripId, { slug: 'e2' });
    const e3 = await createEvent(ctx.db, tripId, { slug: 'e3' });
    const d = await request(ctx.app)
      .post(`/api/itineraries/${itineraryId}/days`)
      .set('Cookie', cookie())
      .send({ dow: 'Tue' });
    const did = d.body.id;
    // insert out of order
    await request(ctx.app).post(`/api/days/${did}/items`).set('Cookie', cookie()).send({ event_id: e1, start_time: '14:00' });
    await request(ctx.app).post(`/api/days/${did}/items`).set('Cookie', cookie()).send({ event_id: e2, time_of_day: 'morning' });
    await request(ctx.app).post(`/api/days/${did}/items`).set('Cookie', cookie()).send({ event_id: e3, start_time: '08:00' });

    const detail = await request(ctx.app).get(`/api/trips/${tripId}`).set('Cookie', cookie());
    const day = detail.body.activeItinerary.days.find((x: any) => x.id === did);
    const order = day.items.map((it: any) => it.event_id);
    expect(order).toEqual([e3, e2, e1]); // 08:00, morning(09:00), 14:00
  });
});
