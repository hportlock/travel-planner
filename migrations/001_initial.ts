import type { Knex } from 'knex';

/**
 * Initial schema. Dialect-portable: Knex schema builder only, `text` (never
 * varchar), app-generated UUID string ids (no auto-increment), JSON via the
 * knex `json` type (degrades to text on SQLite), timestamps on every table.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (t) => {
    t.text('id').primary();
    t.text('google_sub').notNullable().unique();
    t.text('email').notNullable();
    t.text('name').notNullable().defaultTo('');
    t.text('avatar_url');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('personal_access_tokens', (t) => {
    t.text('id').primary();
    t.text('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('token_hash').notNullable().unique();
    t.text('label').notNullable().defaultTo('');
    t.timestamp('last_used_at');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('trips', (t) => {
    t.text('id').primary();
    t.text('owner_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('title').notNullable();
    t.text('subtitle').notNullable().defaultTo('');
    t.text('destination').notNullable().defaultTo('');
    t.text('timezone').notNullable().defaultTo('UTC');
    t.text('start_date');
    t.text('end_date');
    t.text('party').notNullable().defaultTo('');
    t.json('regions').notNullable().defaultTo('{}');
    t.timestamps(true, true);
    t.index('owner_id');
  });

  await knex.schema.createTable('trip_access', (t) => {
    t.text('id').primary();
    t.text('trip_id').notNullable().references('id').inTable('trips').onDelete('CASCADE');
    t.text('role').notNullable().defaultTo('viewer');
    t.text('token').notNullable().unique();
    t.text('label').notNullable().defaultTo('');
    t.timestamps(true, true);
    t.index('trip_id');
  });

  await knex.schema.createTable('lodging', (t) => {
    t.text('id').primary();
    t.text('trip_id').notNullable().references('id').inTable('trips').onDelete('CASCADE');
    t.text('name').notNullable();
    t.text('address').notNullable().defaultTo('');
    t.float('lat');
    t.float('lng');
    t.text('gmap_url').notNullable().defaultTo('');
    t.text('check_in');
    t.text('check_out');
    t.text('cost').notNullable().defaultTo('');
    t.text('notes').notNullable().defaultTo('');
    t.boolean('is_home_base').notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.index('trip_id');
  });

  await knex.schema.createTable('events', (t) => {
    t.text('id').primary();
    t.text('trip_id').notNullable().references('id').inTable('trips').onDelete('CASCADE');
    t.text('slug').notNullable();
    t.text('name').notNullable();
    t.text('emoji').notNullable().defaultTo('');
    t.text('region').notNullable().defaultTo('');
    t.text('url').notNullable().defaultTo('');
    t.text('gmap_url').notNullable().defaultTo('');
    t.float('lat');
    t.float('lng');
    t.text('drive').notNullable().defaultTo('');
    t.text('cost').notNullable().defaultTo('');
    t.text('ages').notNullable().defaultTo('');
    t.text('booking').notNullable().defaultTo('');
    t.text('meal');
    t.text('rating');
    t.text('blurb').notNullable().defaultTo('');
    t.json('tags').notNullable().defaultTo('[]');
    t.timestamps(true, true);
    t.unique(['trip_id', 'slug']);
    t.index('trip_id');
  });

  await knex.schema.createTable('reviews', (t) => {
    t.text('id').primary();
    t.text('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE');
    t.text('quote').notNullable();
    t.text('who').notNullable().defaultTo('');
    t.integer('stars').notNullable().defaultTo(5);
    t.integer('position').notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.index('event_id');
  });

  await knex.schema.createTable('itineraries', (t) => {
    t.text('id').primary();
    t.text('trip_id').notNullable().references('id').inTable('trips').onDelete('CASCADE');
    t.text('slug').notNullable();
    t.text('name').notNullable();
    t.text('vibe').notNullable().defaultTo('');
    t.integer('position').notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(false);
    t.timestamps(true, true);
    t.unique(['trip_id', 'slug']);
    t.index('trip_id');
  });

  await knex.schema.createTable('days', (t) => {
    t.text('id').primary();
    t.text('itinerary_id').notNullable().references('id').inTable('itineraries').onDelete('CASCADE');
    t.integer('position').notNullable().defaultTo(0);
    t.text('dow').notNullable().defaultTo('');
    t.text('date_label').notNullable().defaultTo('');
    t.text('date');
    t.text('flag').notNullable().defaultTo('');
    t.text('flag_color').notNullable().defaultTo('');
    t.text('drive').notNullable().defaultTo('');
    t.text('note').notNullable().defaultTo('');
    t.timestamps(true, true);
    t.index('itinerary_id');
  });

  await knex.schema.createTable('day_items', (t) => {
    t.text('id').primary();
    t.text('day_id').notNullable().references('id').inTable('days').onDelete('CASCADE');
    t.text('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE');
    t.integer('position').notNullable().defaultTo(0);
    t.text('start_time');
    t.text('end_time');
    t.text('time_of_day');
    t.text('note').notNullable().defaultTo('');
    t.timestamps(true, true);
    t.index('day_id');
    t.index('event_id');
  });

  await knex.schema.createTable('themes', (t) => {
    t.text('id').primary();
    t.text('trip_id').notNullable().references('id').inTable('trips').onDelete('CASCADE');
    t.text('name').notNullable().defaultTo('Custom');
    t.boolean('is_active').notNullable().defaultTo(false);
    t.json('tokens').notNullable().defaultTo('{}');
    t.json('fonts').notNullable().defaultTo('{}');
    t.json('hero').notNullable().defaultTo('{}');
    t.json('layout');
    t.text('custom_css').notNullable().defaultTo('');
    t.timestamps(true, true);
    t.index('trip_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('themes');
  await knex.schema.dropTableIfExists('day_items');
  await knex.schema.dropTableIfExists('days');
  await knex.schema.dropTableIfExists('itineraries');
  await knex.schema.dropTableIfExists('reviews');
  await knex.schema.dropTableIfExists('events');
  await knex.schema.dropTableIfExists('lodging');
  await knex.schema.dropTableIfExists('trip_access');
  await knex.schema.dropTableIfExists('trips');
  await knex.schema.dropTableIfExists('personal_access_tokens');
  await knex.schema.dropTableIfExists('users');
}
