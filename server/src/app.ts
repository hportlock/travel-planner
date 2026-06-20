import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import * as path from 'path';
import type { Knex } from 'knex';

import { resolveAuth } from './middleware/resolveAuth';
import { errorHandler } from './middleware/error';
import { authRouter } from './routes/auth';
import { tokensRouter } from './routes/tokens';
import { tripsRouter } from './routes/trips';
import { lodgingRouter } from './routes/lodging';
import { eventsRouter } from './routes/events';
import { itinerariesRouter } from './routes/itineraries';
import { themesRouter } from './routes/themes';
import { sharedRouter } from './routes/shared';

export interface CreateAppOptions {
  /** In prod, serve the built client (client/dist) + SPA fallback. */
  serveStatic?: boolean;
}

/**
 * Builds and returns the Express app WITHOUT listen(). Consumed by index.ts
 * (dev + prod) and by Supertest. The SPA, MCP, and tests speak this same REST
 * contract.
 */
export function createApp(db: Knex, opts: CreateAppOptions = {}): Express {
  const app = express();
  app.locals.db = db;
  app.set('trust proxy', true);

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (process.env.NODE_ENV !== 'production') {
    app.use(cors({ origin: true, credentials: true }));
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Resolve caller (cookie / PAT) for every API route.
  app.use('/api', resolveAuth);

  // Routers.
  app.use('/api/auth', authRouter());
  app.use('/api/tokens', tokensRouter());
  app.use('/api/trips', tripsRouter());
  app.use('/api', lodgingRouter());
  app.use('/api', eventsRouter());
  app.use('/api', itinerariesRouter());
  app.use('/api', themesRouter());
  app.use('/api', sharedRouter());

  // Unknown API route -> JSON 404 (before SPA fallback swallows it).
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  if (opts.serveStatic) {
    const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
