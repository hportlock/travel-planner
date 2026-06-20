import { toolsByName } from '../src/tools';
import type { RestClientLike } from '../src/client';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';

interface Call {
  method: string;
  path: string;
  body?: unknown;
}

function fakeClient(): { client: RestClientLike; calls: Call[] } {
  const calls: Call[] = [];
  const client: RestClientLike = {
    get: async (path) => (calls.push({ method: 'GET', path }), { ok: true }),
    post: async (path, body) => (calls.push({ method: 'POST', path, body }), { ok: true }),
    patch: async (path, body) => (calls.push({ method: 'PATCH', path, body }), { ok: true }),
    del: async (path) => (calls.push({ method: 'DELETE', path }), { ok: true }),
  };
  return { client, calls };
}

async function run(name: string, input: any) {
  const { client, calls } = fakeClient();
  const def = toolsByName[name];
  expect(def).toBeDefined();
  const parsed = def.schema.parse(input);
  const result = await def.handler(client, parsed);
  return { calls, result };
}

describe('MCP tools -> REST mapping', () => {
  it('list_trips -> GET /api/trips', async () => {
    const { calls } = await run('list_trips', {});
    expect(calls[0]).toEqual({ method: 'GET', path: '/api/trips' });
  });

  it('get_trip -> GET /api/trips/:id', async () => {
    const { calls } = await run('get_trip', { trip_id: UUID });
    expect(calls[0]).toEqual({ method: 'GET', path: `/api/trips/${UUID}` });
  });

  it('create_trip -> POST /api/trips with body', async () => {
    const { calls } = await run('create_trip', { title: 'X', timezone: 'Pacific/Honolulu' });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].path).toBe('/api/trips');
    expect((calls[0].body as any).title).toBe('X');
  });

  it('update_trip -> PATCH /api/trips/:id without trip_id in body', async () => {
    const { calls } = await run('update_trip', { trip_id: UUID, title: 'New' });
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].path).toBe(`/api/trips/${UUID}`);
    expect(calls[0].body).toEqual({ title: 'New' });
  });

  it('add_lodging -> POST /api/trips/:id/lodging', async () => {
    const { calls } = await run('add_lodging', { trip_id: UUID, name: 'House' });
    expect(calls[0].path).toBe(`/api/trips/${UUID}/lodging`);
    expect((calls[0].body as any).name).toBe('House');
    expect((calls[0].body as any).trip_id).toBeUndefined();
  });

  it('update_lodging / remove_lodging', async () => {
    expect((await run('update_lodging', { lodging_id: UUID, name: 'Y' })).calls[0]).toMatchObject({
      method: 'PATCH',
      path: `/api/lodging/${UUID}`,
      body: { name: 'Y' },
    });
    expect((await run('remove_lodging', { lodging_id: UUID })).calls[0]).toEqual({
      method: 'DELETE',
      path: `/api/lodging/${UUID}`,
    });
  });

  it('add_event / update_event / remove_event', async () => {
    expect((await run('add_event', { trip_id: UUID, slug: 'a', name: 'A' })).calls[0]).toMatchObject({
      method: 'POST',
      path: `/api/trips/${UUID}/events`,
    });
    expect((await run('update_event', { event_id: UUID, name: 'B' })).calls[0]).toMatchObject({
      method: 'PATCH',
      path: `/api/events/${UUID}`,
      body: { name: 'B' },
    });
    expect((await run('remove_event', { event_id: UUID })).calls[0]).toEqual({
      method: 'DELETE',
      path: `/api/events/${UUID}`,
    });
  });

  it('add_review / remove_review', async () => {
    expect((await run('add_review', { event_id: UUID, quote: 'Great' })).calls[0]).toMatchObject({
      method: 'POST',
      path: `/api/events/${UUID}/reviews`,
    });
    expect((await run('remove_review', { review_id: UUID })).calls[0]).toMatchObject({
      method: 'DELETE',
      path: `/api/reviews/${UUID}`,
    });
  });

  it('itinerary tools', async () => {
    expect((await run('create_itinerary', { trip_id: UUID, slug: 's', name: 'N' })).calls[0]).toMatchObject({
      method: 'POST',
      path: `/api/trips/${UUID}/itineraries`,
    });
    expect((await run('duplicate_itinerary', { itinerary_id: UUID })).calls[0]).toMatchObject({
      method: 'POST',
      path: `/api/itineraries/${UUID}/duplicate`,
    });
    expect((await run('activate_itinerary', { itinerary_id: UUID })).calls[0]).toMatchObject({
      method: 'POST',
      path: `/api/itineraries/${UUID}/activate`,
    });
  });

  it('day + day_item tools', async () => {
    expect((await run('add_day', { itinerary_id: UUID, dow: 'Mon' })).calls[0]).toMatchObject({
      method: 'POST',
      path: `/api/itineraries/${UUID}/days`,
    });
    expect((await run('add_day_item', { day_id: UUID, event_id: UUID2, time_of_day: 'morning' })).calls[0]).toMatchObject({
      method: 'POST',
      path: `/api/days/${UUID}/items`,
      body: { event_id: UUID2, time_of_day: 'morning' },
    });
    expect((await run('update_day_item', { item_id: UUID, note: 'hi' })).calls[0]).toMatchObject({
      method: 'PATCH',
      path: `/api/day-items/${UUID}`,
    });
    expect((await run('reorder_day', { day_id: UUID, itemIds: [UUID2] })).calls[0]).toMatchObject({
      method: 'POST',
      path: `/api/days/${UUID}/reorder`,
      body: { itemIds: [UUID2] },
    });
  });

  it('theming tools', async () => {
    expect((await run('set_theme', { trip_id: UUID, tokens: { '--coral': '#f00' } })).calls[0]).toMatchObject({
      method: 'PATCH',
      path: `/api/trips/${UUID}/themes`,
    });
    expect((await run('set_layout', { trip_id: UUID, layout: { dayStyle: 'timeline' } })).calls[0]).toMatchObject({
      method: 'PATCH',
      path: `/api/trips/${UUID}/themes`,
    });
    expect((await run('set_custom_css', { trip_id: UUID, custom_css: '.tp-day{}' })).calls[0]).toMatchObject({
      method: 'PATCH',
      path: `/api/trips/${UUID}/themes`,
      body: { custom_css: '.tp-day{}' },
    });
    expect((await run('list_themes', { trip_id: UUID })).calls[0]).toMatchObject({
      method: 'GET',
      path: `/api/trips/${UUID}/themes`,
    });
    expect((await run('activate_theme', { theme_id: UUID })).calls[0]).toMatchObject({
      method: 'POST',
      path: `/api/themes/${UUID}/activate`,
    });
  });

  it('get_theming_api returns hooks without an HTTP call', async () => {
    const { calls, result } = await run('get_theming_api', {});
    expect(calls).toHaveLength(0);
    expect(result.hooks).toBeDefined();
    expect(result.layoutVariants.dayStyle).toContain('timeline');
  });

  it('create_share_link -> POST /api/trips/:id/share', async () => {
    const { calls } = await run('create_share_link', { trip_id: UUID, label: 'fam' });
    expect(calls[0]).toMatchObject({ method: 'POST', path: `/api/trips/${UUID}/share`, body: { label: 'fam' } });
  });
});
