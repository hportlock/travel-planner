import request from 'supertest';
import { makeTestApp, destroyTestApp, createUser, sessionCookie, createTrip, type TestCtx } from './helpers';
import { sanitizeCustomCss } from '../src/services/css';

let ctx: TestCtx;
let userId: string;
let tripId: string;
const cookie = () => sessionCookie(userId);

beforeAll(async () => {
  ctx = await makeTestApp();
  userId = (await createUser(ctx.db)).id;
  tripId = (await createTrip(ctx.db, userId)).tripId;
});
afterAll(() => destroyTestApp(ctx));

describe('sanitizeCustomCss (unit)', () => {
  it('strips @import and tag breakouts and scopes selectors', () => {
    const { css, removed } = sanitizeCustomCss(
      '@import url(evil.css); .tp-day { color: red } </style><script>x</script> .tp-hero{background:blue}',
    );
    expect(css).not.toMatch(/@import/i);
    expect(css).not.toMatch(/<\/?\s*(style|script)/i);
    expect(css).toContain('#trip-root .tp-day');
    expect(css).toContain('#trip-root .tp-hero');
    expect(removed).toEqual(expect.arrayContaining(['@import', 'tag-breakout']));
  });

  it('flags and rescopes selectors targeting app chrome / the page', () => {
    const { css, removed } = sanitizeCustomCss('body { background: black } #editor { display:none }');
    expect(removed).toContain('escaping-selector');
    expect(css).toContain('#trip-root body');
    expect(css).toContain('#trip-root #editor');
  });

  it('size-caps oversized css', () => {
    const big = '.tp-day{color:red}\n'.repeat(5000);
    const { removed } = sanitizeCustomCss(big);
    expect(removed).toContain('size-cap');
  });

  it('scopes inner rules of @media blocks', () => {
    const { css } = sanitizeCustomCss('@media (max-width: 600px) { .tp-day { color: red } }');
    expect(css).toMatch(/@media/);
    expect(css).toContain('#trip-root .tp-day');
  });
});

describe('theme upsert + active flag (API)', () => {
  it('upserts the active theme with tokens and sanitized css', async () => {
    const res = await request(ctx.app)
      .patch(`/api/trips/${tripId}/themes`)
      .set('Cookie', cookie())
      .send({
        name: 'Test',
        tokens: { '--coral': '#f00' },
        custom_css: '@import url(x); .tp-hero { color: var(--coral) }',
      });
    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(true);
    expect(res.body.tokens['--coral']).toBe('#f00');
    expect(res.body.custom_css).not.toMatch(/@import/i);
    expect(res.body.custom_css).toContain('#trip-root .tp-hero');
    expect(res.body._sanitized.removed).toContain('@import');
  });

  it('rejects an unknown layout variant via zod', async () => {
    const res = await request(ctx.app)
      .patch(`/api/trips/${tripId}/themes`)
      .set('Cookie', cookie())
      .send({ layout: { dayStyle: 'spreadsheet' } });
    expect(res.status).toBe(400);
  });

  it('accepts a valid layout', async () => {
    const res = await request(ctx.app)
      .patch(`/api/trips/${tripId}/themes`)
      .set('Cookie', cookie())
      .send({ layout: { dayStyle: 'timeline', heroVariant: 'glass' } });
    expect(res.status).toBe(200);
    expect(res.body.layout.dayStyle).toBe('timeline');
    expect(res.body.layout.heroVariant).toBe('glass');
  });

  it('keeps exactly one active theme when a new version is posted', async () => {
    const post = await request(ctx.app)
      .post(`/api/trips/${tripId}/themes`)
      .set('Cookie', cookie())
      .send({ name: 'V2', tokens: { '--ocean': '#0af' } });
    expect(post.status).toBe(201);
    const list = await request(ctx.app).get(`/api/trips/${tripId}/themes`).set('Cookie', cookie());
    expect(list.body.filter((t: any) => t.is_active)).toHaveLength(1);
    expect(list.body.find((t: any) => t.is_active).name).toBe('V2');
  });

  it('forbids theming a trip you do not own', async () => {
    const other = await createUser(ctx.db, { email: 'mallory@example.com' });
    const res = await request(ctx.app)
      .patch(`/api/trips/${tripId}/themes`)
      .set('Cookie', sessionCookie(other.id))
      .send({ name: 'hijack' });
    expect(res.status).toBe(403);
  });
});
