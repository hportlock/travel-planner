import * as path from 'path';
import knexFactory, { Knex } from 'knex';

/**
 * Module-singleton knex (pool-aware). In prod it uses the plugin-injected
 * DATABASE_URL with a normal pool; in dev/test it uses SQLite. This mirrors the
 * root knexfile.ts (which the migrate/seed CLI uses) but is self-contained so
 * the server package compiles without reaching outside its rootDir.
 *
 * Tests build their own isolated knex (see tests/setup.ts) and inject it into
 * createApp(), so they never touch this singleton.
 */
let singleton: Knex | null = null;

export function buildConfig(env = process.env.NODE_ENV || 'development'): Knex.Config {
  if (env === 'production') {
    return {
      client: 'pg',
      connection: process.env.DATABASE_URL,
      pool: { min: 2, max: 10 },
    };
  }
  if (env === 'test') {
    return {
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
      pool: { min: 1, max: 1 },
    };
  }
  return {
    client: 'better-sqlite3',
    connection: { filename: path.join(__dirname, '..', '..', 'dev.sqlite3') },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
  };
}

export function makeKnex(env = process.env.NODE_ENV || 'development'): Knex {
  return knexFactory(buildConfig(env));
}

export function getDb(): Knex {
  if (!singleton) singleton = makeKnex();
  return singleton;
}

export async function closeDb(): Promise<void> {
  if (singleton) {
    await singleton.destroy();
    singleton = null;
  }
}

/* ============================================================
 * Portable column helpers
 * SQLite (better-sqlite3): json columns come back as TEXT, booleans as 0/1.
 * Postgres: json columns come back parsed, booleans as true/false.
 * ========================================================== */

/** Serialize a JS value for a json column (always store as string — portable). */
export function serializeJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** Parse a json column value that may be a string (SQLite) or already parsed (PG). */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    if (value === '') return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

/** Coerce a boolean column value (0/1, '0'/'1', true/false). */
export function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 't';
}
