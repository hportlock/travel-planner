import { config as loadEnv } from 'dotenv';
loadEnv();

import { getDb } from './db';
import { createApp } from './app';

const isProd = process.env.NODE_ENV === 'production';
const db = getDb();
const app = createApp(db, { serveStatic: isProd });

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[travel-plan] server listening on :${port} (${process.env.NODE_ENV || 'development'})`);
});
