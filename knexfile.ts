import type { Knex } from 'knex';
import * as path from 'path';

const migrations: Knex.MigratorConfig = {
  directory: path.join(__dirname, 'migrations'),
  extension: 'ts',
  loadExtensions: ['.ts', '.js'],
};

const seeds: Knex.SeederConfig = {
  directory: path.join(__dirname, 'seeds'),
  extension: 'ts',
  loadExtensions: ['.ts', '.js'],
};

const config: { [env: string]: Knex.Config } = {
  development: {
    client: 'better-sqlite3',
    connection: { filename: path.join(__dirname, 'dev.sqlite3') },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
    migrations,
    seeds,
  },

  test: {
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    // A single shared connection so the in-memory DB persists across queries.
    pool: { min: 1, max: 1 },
    migrations,
    seeds,
  },

  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
    migrations,
    seeds,
  },
};

export default config;
