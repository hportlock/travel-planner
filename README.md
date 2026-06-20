# Travel-Plan

A multi-tenant, mobile-first **travel-planning web app** (PWA). A signed-in host creates a **trip**, adds **lodging** and **events** organized into **days** across one or more **itinerary variants**, customizes the **look & feel** (layered theming, applied live via an **MCP server**), and **shares** a read-only link with invitees. One long-lived Express process serves the REST API and the built React SPA; deploys to **Dokku**.

The first seed trip is the real **Big Island 2026** family itinerary — used to validate the schema against messy real data.

## Stack

TypeScript everywhere. **Server:** Express + Knex (SQLite in dev/test, Postgres in prod). **Client:** React + Vite + Tailwind + vite-plugin-pwa. **Shared:** a `@travel-plan/shared` package of types + zod schemas + the time-ordering rule + the theming-API contract. **MCP:** stdio server (PAT auth) wrapping the REST API. **Tests:** Jest + Supertest on in-memory SQLite.

## Monorepo layout

```
travel-plan/
├── shared/    @travel-plan/shared — types.ts, schemas.ts (zod), time.ts, theming.ts
├── server/    Express app (app.ts builds it WITHOUT listen()), routes, auth, middleware, services
├── mcp/        stdio MCP server: client.ts (REST+PAT), tools.ts (transport-agnostic), index.ts
├── client/     React + Vite + Tailwind PWA (ShareView, TripEdit, ThemeProvider)
├── migrations/ knex migrations (dialect-portable)
├── seeds/      01_hawaii_trip.ts + data/hawaii.json (the seed trip)
├── knexfile.ts development(sqlite) / test(sqlite :memory:) / production(pg)
├── Dockerfile  multi-stage build; Procfile web+release; .dockerignore
```

The load-bearing idea: **one Express app, one source of truth.** `server/src/app.ts` exports `createApp(db)` (no `listen()`), consumed by `index.ts` (dev/prod) and by Supertest. The SPA, MCP, and tests all speak the same REST contract.

## Getting started

```bash
npm install                  # installs all workspaces (needs build tools for better-sqlite3)
npm run db:reset             # migrate + seed the Hawaii trip — prints the share URL
npm run dev                  # Express :3001 + Vite :5173 (proxies /api)
npm test                     # Jest + Supertest on in-memory SQLite
```

`npm run db:reset` prints the seeded owner, trip, and a **share URL** like
`http://localhost:5173/t/<token>`. The same trip is reachable read-only over HTTP at
`GET http://localhost:3001/api/shared/<token>`.

### Environment

Copy `.env.example` → `.env`. Key vars: `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `APP_BASE_URL`,
`PORT`, and (prod only) `DATABASE_URL` (injected by the Dokku postgres plugin). The client reads the
Google client id at runtime from `GET /api/config` (served from `GOOGLE_CLIENT_ID`), so there's no
build-time client var — set `GOOGLE_CLIENT_ID` once per environment (root `.env` in dev,
`dokku config:set` in prod).

## Dev container (local)

For an isolated, reproducible environment (and to run an autonomous Claude Code agent
safely), use the Docker dev container via the `./dc` helper. **Prerequisite:** Docker
Desktop running. This is for **dev/agent only** — production is unchanged (see
[Deploy (Dokku)](#deploy-dokku)).

```bash
./dc build          # build the dev image
./dc login          # one-time: opens Claude in the container — run /login, then exit
./dc test           # npm test (real Supertest; sockets work in the container)
./dc reset          # db:reset (wipe + migrate + seed) — regenerates the share token
./dc dev            # npm run dev → open http://localhost:5173 (does NOT touch the DB)
./dc shell          # interactive bash in the container (run any npm script)
export GOAL='/goal ...'
./dc agent          # headless autonomous Claude run toward $GOAL
```

Notes:

- **First run:** `./dc reset` once to create + seed the DB, then `./dc dev` for day-to-day work.
  `./dc dev` no longer resets the DB (it mirrors `npm run dev`), so your data — logins, edits,
  ownership — persists across restarts. Run `./dc reset` only when you want fresh seed data
  (it regenerates the share token).
- **Login persists.** Claude's macOS login lives in the Keychain and won't mount in, so
  `./dc login` authenticates *inside* the container; it's saved in the `travel-claude-home`
  volume and reused by later commands.
- **Ports 3001/5173 publish to your host** — open the dev server in your normal browser.
  Because they're published, run `./dc dev` *or* `./dc agent`, not both at once.
- **`node_modules` is a named volume** (`travel-node-modules`) holding the container's Linux
  build of `better-sqlite3`, kept separate from your host's macOS `node_modules`.
- Editor users can instead "Reopen in Container" via `.devcontainer/` (optional; the `./dc`
  flow doesn't need it). See [Testing](#testing) for what the suite covers.

## REST API (consumed by client, MCP, tests)

- **Auth:** `POST /api/auth/google`, `GET /api/auth/me`, `POST /api/auth/logout`
- **Tokens (PAT, host-only):** `POST/GET /api/tokens`, `DELETE /api/tokens/:id`
- **Trips:** `GET/POST /api/trips`, `GET/PATCH/DELETE /api/trips/:id`, `POST /api/trips/:id/share`
- **Lodging:** `GET/POST /api/trips/:id/lodging`, `PATCH/DELETE /api/lodging/:id`
- **Events:** `GET/POST /api/trips/:id/events`, `PATCH/DELETE /api/events/:id`, `POST /api/events/:id/reviews`, `PATCH/DELETE /api/reviews/:id`
- **Itineraries:** `GET/POST /api/trips/:id/itineraries`, `PATCH/DELETE /api/itineraries/:id`, `POST /api/itineraries/:id/activate`, `POST /api/itineraries/:id/duplicate`
- **Days/items:** `GET/POST /api/itineraries/:id/days`, `PATCH/DELETE /api/days/:id`, `GET/POST /api/days/:id/items`, `PATCH/DELETE /api/day-items/:id`, `POST /api/days/:id/reorder`
- **Themes:** `GET/POST/PATCH /api/trips/:id/themes`, `POST /api/themes/:id/activate`
- **Public read:** `GET /api/shared/:shareToken` (read-only trip), `GET /api/theming-api`

Auth: a `resolveAuth` middleware resolves the caller from (a) the signed JWT session cookie or
(b) a `Bearer <PAT>` (for MCP). Mutations require `requireOwner` (an authenticated user who owns
the target trip); reads are allowed for the owner or via a viewer share token. Every query is
scoped by trip, so a token/user can never reach another trip.

## Time & timezones

`trips.timezone` (IANA) is the trip's canonical zone. Times are **destination wall-clock**, stored
as plain `HH:MM` strings and never tz-converted for display. A `day_item` may have a precise
`start_time`(`–end_time`), OR a `time_of_day` bucket (`morning|midday|afternoon|evening|night`),
OR neither. Ordering is deterministic (`shared/src/time.ts`): timed items sort by `start_time`,
buckets map to a nominal minute and interleave, ties break by `position`. Real instants are derived
at the edges, never stored.

## Theming pipeline (T1–T3) — the stable theming API

All theming is **data** on the active `themes` row (re-theming is never a redeploy):

- **T1 design tokens** — `tokens` (CSS-variable map), `fonts`, `hero`. `ThemeProvider` writes each
  token onto `#trip-root` via `style.setProperty`, injects the Google Fonts `<link>`, and Tailwind
  reads the same CSS variables (`coral`, `ocean`, `bg`, `ink`, `radius`, font families).
- **T2 layout** — a zod-validated `layout` JSON selecting **app-implemented variants**:
  `heroVariant` (postcard|editorial|glass|minimal), `dayStyle` (timeline|cards|grid),
  `sectionOrder`/`sectionVisibility`, `density`, `cardShape`, `showRegionColors`, `decor`.
  Unknown variants are rejected by the API.
- **T3 custom CSS** — `custom_css` is **sanitized and scoped under `#trip-root`** on write
  (strips `@import`, tag-breakouts, `expression()`/`javascript:`/`behavior:`, rescopes
  editor/page-targeting selectors, size-capped). CSS only, no HTML/JS.

### Stable hooks (target these in `custom_css`)

Components always render these class hooks:

`.tp-root .tp-hero .tp-hero-title .tp-hero-sub .tp-meta .tp-variant-switch .tp-section .tp-day
.tp-day-head .tp-day-flag .tp-activity .tp-activity-emoji .tp-activity-name .tp-activity-time
.tp-region-pill .tp-detail .tp-review .tp-lodging`

…and data attributes: `data-region`, `data-time-of-day`, `data-tag` (on activities), and
`data-hero-variant` / `data-day-style` / `data-density` (on `#trip-root`). Tokens available:
`--coral --ocean --bg --ink --sunset --radius --font-display --font-body --font-mono --region-color`.

The MCP `get_theming_api` tool (and `GET /api/theming-api`) returns this contract plus the layout
enums, so a design agent knows exactly what it can target.

**Workflow:** Claude generates `{tokens, fonts, hero, layout, custom_css}` → MCP `set_theme` →
`PATCH /api/trips/:id/themes` sanitizes + upserts + activates → client re-applies on next load.

## MCP server

`npm run mcp` starts the stdio server (env `TRAVEL_API_URL` + `TRAVEL_PAT`). Tools are
transport-agnostic pure `(input) → REST call` functions validated by the shared zod schemas:
`get_trip`, `list_trips`, `create_trip`, `update_trip`, lodging/event/review CRUD,
`create_itinerary`/`duplicate_itinerary`/`update_itinerary`/`activate_itinerary`, day/day-item CRUD,
`reorder_day`, `set_theme`/`set_layout`/`set_custom_css`/`list_themes`/`activate_theme`,
`get_theming_api`, `create_share_link`.

## PWA / offline

`vite-plugin-pwa` (autoUpdate): precaches the app shell, **StaleWhileRevalidate** for
`GET /api/shared/*` and `GET /api/trips/*` reads (instant offline viewing of a shared trip),
`NetworkOnly` for mutations. (Add real `public/icon-192.png` / `icon-512.png`.)

## Deploy (Dokku)

Single app, single container. `git push dokku main` builds the `Dockerfile` and runs the long-lived
Express process. The `Procfile` `release: npm run migrate:prod` applies migrations before each new
release goes live. Postgres via the plugin (`DATABASE_URL`), TLS via Let's Encrypt, secrets via
`dokku config:set`. Prod == dev: same Knex/Express/Postgres, no serverless.

## Testing

Integration-first against in-memory SQLite (`server/tests/helpers.ts` migrates a fresh `:memory:`
DB per suite and injects it into `createApp`). Coverage: trip/event/lodging/itinerary CRUD,
`day_items` ordering + reorder, the time model (interleave ordering, `HH:MM`/enum validation,
wall-clock values unchanged), auth boundaries (viewer can't mutate, user/token can't cross trips,
PAT works as host), theme upsert/active-flag, `custom_css` sanitization + scoping, `layout` zod
validation, the Google handler with a mocked verifier, and the MCP tools → REST mapping.
