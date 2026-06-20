/**
 * End-to-end boot + serve check for the seeded Hawaii trip.
 *
 * The sandbox blocks all socket listen()/connect() (verified: EPERM on
 * 0.0.0.0, 127.0.0.1, localhost, and unix sockets — even with the sandbox
 * disabled), so a real `curl http://localhost:PORT` cannot run here. This
 * drives the *exact same* Express app produced by createApp() against the
 * real seeded dev.sqlite3 file, issuing the request through an in-memory HTTP
 * injector (light-my-request). Every layer a curl would traverse — routing,
 * resolveAuth middleware, the shared-token lookup, buildTripDetail, JSON
 * serialization — runs unchanged. Only the TCP transport is swapped out.
 */
import inject from 'light-my-request';
import { makeKnex } from '../server/src/db';
import { createApp } from '../server/src/app';

async function main() {
  const db = makeKnex('development');
  const app = createApp(db);

  // Find the seeded trip + its viewer share token (what the share URL embeds).
  const access = await db('trip_access').first();
  if (!access) throw new Error('No trip_access row — did the seed run? (npm run db:reset)');
  const token: string = access.token;

  const url = `/api/shared/${token}`;
  console.log(`GET ${url}\n`);
  const res = await inject(app, { method: 'GET', url });

  console.log('HTTP', res.statusCode, res.headers['content-type']);
  if (res.statusCode !== 200) {
    console.error('Body:', res.payload.slice(0, 500));
    throw new Error(`Expected 200, got ${res.statusCode}`);
  }

  const body = res.json();
  const eventCount = body.events?.length ?? 0;
  const itinCount = body.itineraries?.length ?? 0;
  const active = body.activeItinerary;
  const dayCount = active?.days?.length ?? 0;

  console.log('trip.title      :', body.title);
  console.log('trip.destination:', body.destination);
  console.log('trip.timezone   :', body.timezone);
  console.log('events          :', eventCount);
  console.log('itineraries     :', itinCount, '->', body.itineraries?.map((i: any) => i.slug).join(', '));
  console.log('active itinerary:', active?.slug, `(${dayCount} days)`);
  console.log('theme active    :', body.theme?.name ?? '(none)');

  // Assertions: this must be the real Hawaii data, not an empty shell.
  const problems: string[] = [];
  if (!/big island|hawaii/i.test(`${body.title} ${body.destination}`))
    problems.push('trip is not the Hawaii trip');
  if (body.timezone !== 'Pacific/Honolulu') problems.push('timezone is not Pacific/Honolulu');
  if (eventCount < 50) problems.push(`expected >=50 events, got ${eventCount}`);
  if (itinCount < 4) problems.push(`expected 4 itinerary variants, got ${itinCount}`);
  if (active?.slug !== 'volcano4') problems.push(`active itinerary should be volcano4, got ${active?.slug}`);
  if (dayCount < 1) problems.push('active itinerary has no days');

  await db.destroy();

  if (problems.length) {
    console.error('\nFAIL:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log('\nOK — seeded Hawaii trip is reachable over HTTP at its share endpoint.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
