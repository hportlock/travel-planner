# Travel-Plan — Implementation Plan

## Context

Build a greenfield, multi-tenant **travel-planning web app**. A signed-in host creates a **trip**, adds **lodging** and **events/activities** organized into **days**, customizes the trip's **look & feel** ("Claude design" generates a theme, then an **MCP server** applies it), and **shares** a read-only link with invitees. The app is **mobile-first + a PWA** (installable, works offline for viewers). Deploys to a self-hosted **Dokku** server.

The existing self-contained Hawaii itinerary (`~/Documents/Claude Cowork/Hawaii 2026/itinerary-planner.html` + `Volcano-the-4th-map.csv`) is the data model reference and becomes the **first seed trip**, validating the schema against real, messy data early. When running in the sandbox, this reference folder is mounted read-only at `/Users/rome/Documents/Claude Cowork/Hawaii 2026` (adjust the path if the mount differs).

### Decisions (settled with user)
- **TypeScript** across server, client, MCP, and a shared types/validation package.
- **Auth:** Google OAuth → **host accounts** own & edit their trips; **read-only capability share links** for invitees (no account). MCP authenticates via a **personal access token (PAT)** tied to a host account.
- **MCP:** **local stdio now** (PAT auth, calls the deployed REST API). Tool layer kept transport-agnostic so a **remote HTTP/OAuth MCP can be added later** without rewriting tools.
- **Deploy:** self-hosted **Dokku** (`git push dokku main`). Long-lived Express process — no serverless wrapping. Express serves the built React SPA. TLS via Dokku's Let's Encrypt plugin; Postgres via the Dokku postgres plugin.
- **DB:** **Postgres** (Dokku postgres plugin) in prod — app uses the plugin-injected `DATABASE_URL` with a normal connection pool. **SQLite** in dev/test. Portable migrations only.
- Stack (fixed by user): Express + Knex; React + Tailwind; Jest + Supertest.

---

## Architecture overview

The load-bearing idea: **one Express app, one source of truth.** `server/src/app.ts` builds and returns the Express app *without* `listen()`. It's consumed by (1) `server/src/index.ts` for both local dev and prod (calls `listen()`, and in prod also serves `client/dist` static + SPA fallback), and (2) Supertest for integration tests. The React SPA, the MCP server, and the tests all speak to the **same REST contract**. Keeping the `createApp()` split (no `listen()` inside) is what keeps Supertest clean.

A trip is **not** a single itinerary. It's a **catalog of events/lodging** plus one or more **itinerary variants** (the Hawaii data has 4: Easy Breeze / Explorers / Best of Both / Volcano the 4th), where the same event appears in multiple variants on different days with different time-of-day/notes. Schema therefore separates the **event catalog** from **day placements**.

**Itineraries — keep the schema, defer the UI (decided with user).** The `itineraries` table stays (one extra FK hop, near-zero cost, and the importer needs it for the 4 Hawaii plans), but the default experience is single-itinerary: every trip has exactly one **active** itinerary that loads by default; the variant switcher renders **only when >1 itinerary exists**, so a normal trip shows no variant chrome. Multiple variants are primarily an **agent-driven** feature — the MCP can create/duplicate/activate variants (e.g. "Claude, draft a rainy-day version"), matching the real workflow of exploring a few options then converging on one keeper. This avoids a painful future migration (adding the table after live data exists) while keeping the simple case simple.

### Project layout (monorepo, npm workspaces)
```
travel-plan/
├── package.json                # workspaces: shared, server, mcp, client; root scripts
├── knexfile.ts                 # development(sqlite) / test(sqlite :memory:) / production(pg)
├── Dockerfile                  # multi-stage build of the workspaces monorepo; runs the server
├── Procfile                    # web: node ... ; release: npm run migrate:prod
├── .dockerignore
├── tsconfig.base.json
├── .env.example
├── shared/src/                 # @travel-plan/shared — types.ts + schemas.ts (zod), no runtime deps
├── server/src/
│   ├── app.ts                  # builds Express app, NO listen()
│   ├── index.ts                # listen(); in prod also serves client/dist static + SPA fallback
│   ├── db.ts                   # module-singleton knex (pool-aware)
│   ├── auth/                   # google.ts (verify ID token), session.ts (JWT cookie), pat.ts
│   ├── middleware/             # resolveAuth.ts, requireOwner.ts, error.ts
│   ├── routes/                 # auth, trips, lodging, events, itineraries, themes, share, tokens
│   └── services/               # business logic shared by routes
├── migrations/                 # 001..00N knex migrations (dialect-portable)
├── seeds/
│   ├── 01_hawaii_trip.ts
│   └── data/hawaii.json        # one-time export of ACT + REGION + PLANS joined w/ CSV lat/lng
├── mcp/src/                    # index.ts (stdio), client.ts (REST + PAT), tools.ts
└── client/                     # React + Vite + Tailwind + vite-plugin-pwa
    └── src/{api,theme,pages,components}
```

---

## Database schema (Knex, dialect-portable)

Rules enforced in code review: **Knex schema builder only** (no raw PG SQL), `text` not `varchar`, **app-generated UUID strings** (`crypto.randomUUID()`), JSON via Knex `json` type (degrades to text on SQLite — wrap with a serialize helper). Timestamps on every table.

- **`users`** — `id`, `google_sub` (unique), `email`, `name`, `avatar_url`, `created_at`.
- **`personal_access_tokens`** — `id`, `user_id` fk, `token_hash`, `label`, `last_used_at`, `created_at`. For MCP Bearer auth (store hash, show plaintext once).
- **`trips`** — `id`, `owner_id` fk→users, `title`, `subtitle`, `destination`, `timezone` (IANA, e.g. `Pacific/Honolulu` — the trip's canonical zone; see Time & timezones), `start_date`, `end_date`, `party`, `regions` (json: `{key:{label,color}}`), timestamps.
- **`trip_access`** — `id`, `trip_id` fk, `role` (`'viewer'`), `token` (unique, `randomBytes(32).base64url`), `label`, `created_at`. Read-only share links; extensible to `'editor'` invites later.
- **`lodging`** — `id`, `trip_id` fk, `name`, `address`, `lat`, `lng`, `gmap_url`, `check_in`, `check_out`, `cost`, `notes`, `is_home_base`.
- **`events`** (the activity catalog / `ACT`) — `id`, `trip_id` fk, `slug` (unique per trip), `name`, `emoji`, `region`, `url`, `gmap_url`, `lat`, `lng`, `drive`, `cost`, `ages`, `booking`, `meal?`, `rating?`, `blurb`, `tags` (json), timestamps.
- **`itineraries`** (the `PLANS` variants) — `id`, `trip_id` fk, `slug`, `name`, `vibe`, `position`, `is_active` (the converged-on "keeper"; the trip loads this by default — exactly one active per trip).
- **`days`** — `id`, `itinerary_id` fk, `position`, `dow`, `date_label`, `date?`, `flag`, `flag_color`, `drive`, `note`.
- **`day_items`** (ordered placements / the `items` tuples) — `id`, `day_id` fk, `event_id` fk→events, `position`, `start_time`/`end_time` (`HH:MM` 24h **wall-clock**, both optional), `time_of_day` (enum `morning|midday|afternoon|evening|night`, nullable — ordering/grouping fallback when no precise time), `note`. See Time & timezones.
- **`reviews`** — `id`, `event_id` fk, `quote`, `who`, `stars`, `position`.
- **`themes`** — `id`, `trip_id` fk, `name`, `is_active` (one active/trip), and the layered design (T1–T3, see Theming):
  - `tokens` (json) — T1: CSS custom-property map (`--coral`, `--sunset` gradient, `--radius`, …).
  - `fonts` (json) — T1: `{display, body, mono, url}`.
  - `hero` (json) — T1/T2: `{variant, gradient, stamp, motifs}`.
  - `layout` (json) — T2: structured, app-implemented variants, e.g. `{heroVariant, dayStyle:"timeline|cards|grid", sectionOrder:[…], sectionVisibility:{…}, density, cardShape, showRegionColors, decor:{pattern, dividers, motifs}}`.
  - `custom_css` (text) — T3: sanitized, scoped bespoke CSS (see Theming security).
  - timestamps. Versioned rows let the host keep/switch whole designs.

**Hawaii mapping:** `REGION`→`trips.regions`; each `ACT` entry→`events` row (key→`slug`) + extracted `reviews`; CSV joined by name backfills `lat/lng/gmap`; each `PLANS` entry→`itineraries` + `days` + `day_items` (resolving the `[activityId,timeOfDay,note]` tuples via `events.slug`), with **Volcano the 4th** marked `is_active` (the keeper); the tropical redesign CSS→one active `themes` row. For `day_items`, parse the source free-text `time_of_day` into `start_time`/`end_time` where a real time exists ("12:15pm", "5:30–8:30pm") and otherwise into the bucket enum ("Morning"→`morning`, "Lunch"→`midday`); never fabricate precise times. Trip `timezone` = `Pacific/Honolulu`.

---

## Time & timezones (decided with user)

- **Trip-level timezone.** `trips.timezone` (IANA) is the trip's canonical zone. Per-day/per-item tz override is a deliberate future addition (multi-country/cruise trips) — not built now.
- **Times are destination wall-clock and never tz-converted for display.** A 5:30pm luau always renders "5:30pm" regardless of the viewer's location. `start_time`/`end_time` are stored as plain `HH:MM` strings (portable across SQLite/Postgres), **not** UTC timestamps — which avoids the classic render-time drift/DST bugs.
- **Optional + structured, not free text.** A `day_item` may have a precise `start_time`(–`end_time`), OR just a `time_of_day` bucket, OR neither. The free-form source label is dropped in favor of these structured fields (zod-validated enum). This keeps early planning honestly fuzzy while making the data sortable/groupable.
- **Deterministic ordering within a day:** timed items sort by `start_time`; untimed items sort by bucket order then `position`; the two interleave by mapping each bucket to a nominal sort time. Rendering shows the precise time (12h) when present, else the bucket name.
- **Real instants are derived at the edges, never stored.** Future features (`.ics` export, "starts in 2h" reminders, travel-gap/conflict detection using event drive times) compute an instant on demand from `day.date + start_time + trip.timezone` via a tz lib (Luxon/date-fns-tz). The model supports this without storing anything tz-converted.

## Auth & sharing

- **Host login (Google OAuth):** client uses Google Identity Services to get an ID token → `POST /api/auth/google` → server verifies it with `google-auth-library`, upserts `users`, issues an **httpOnly, signed JWT session cookie** (stateless — no session store to run). `server/src/auth/`.
- **`resolveAuth` middleware:** resolves the caller from, in order, (a) session cookie → host user, (b) `Authorization: Bearer <PAT>` → host user (for MCP), (c) `:shareToken` path/header → read-only access to that one trip. Attaches `req.auth = {userId?, tripScope?, role}`.
- **`requireOwner`:** mutating routes require an authenticated user who owns the target trip. Read routes allow owner OR a valid viewer share token. Every query is scoped by trip → a token/user can never reach another trip.
- **Share link:** `POST /api/trips/:id/share` mints a `trip_access` viewer token; viewer URL `/(t)/:shareToken`. Editor UI lives behind login at `/trip/:id`.
- **PAT management:** `POST/GET/DELETE /api/tokens` (host-only) to mint/revoke MCP tokens, shown once.

---

## REST API (consumed by client, MCP, tests)
`/api/auth/google`, `/api/auth/me`, `/api/auth/logout` · `/api/tokens` · `/api/trips` (CRUD, list own) · `/api/trips/:id/share` · `/api/trips/:id/lodging` (CRUD) · `/api/trips/:id/events` (CRUD) + `/events/:id/reviews` · `/api/trips/:id/itineraries` (CRUD + activate; creating a trip auto-creates one default `is_active` itinerary so the invariant "exactly one active per trip" always holds) · `/itineraries/:id/days` (CRUD) · `/days/:id/items` (CRUD) + `/days/:id/reorder` · `/api/trips/:id/themes` (list/upsert/activate). Public read variant: `/api/shared/:shareToken/...` resolves a trip read-only.

---

## Theming pipeline ("Claude design" → MCP → live) — layered T1–T3

Three layers, all stored on the active `themes` row and all just **data** (re-theming is never a redeploy):

**T1 — design tokens.** `tokens` (CSS-variable map), `fonts`, `hero` colors. `ThemeProvider` fetches the active theme with the trip, writes each token via `el.style.setProperty(...)` on the trip root, and injects the Google Fonts `<link>`. **Tailwind reads the CSS variables** so static and dynamic styling share one source of truth:
```js
// tailwind.config.js → theme.extend
colors: { coral:"var(--coral)", ocean:"var(--ocean)", bg:"var(--bg)", ink:"var(--ink)" },
borderRadius: { card:"var(--radius)" },
fontFamily: { display:["var(--font-display)"], body:["var(--font-body)"] }
```
Tailwind handles structure/spacing (build-time); CSS variables handle palette/fonts/gradients (runtime).

**T2 — structured layout config.** `layout` JSON selects among **app-implemented variants**: hero style, day rendering (`timeline|cards|grid`), section order/visibility, density, card shape, decorative motifs. Components branch on these (`data-*` attributes + conditional classes) — no arbitrary code, fully validated by a zod enum/shape, safe to set via MCP.

**T3 — scoped custom CSS (the bespoke-design unlock).**
- **Stable theming API:** every component renders documented, stable hooks — class names (`.tp-hero`, `.tp-day`, `.tp-activity`, `.tp-detail`, …) and `data-*` (`data-region`, `data-time-of-day`, `data-tag`). This is a first-class deliverable (documented in the README) so Claude's CSS targets reliable selectors, not implementation details.
- **Injection:** `custom_css` is rendered into a single `<style>` whose rules are **scoped under the trip-root wrapper** (e.g. `#trip-root { … }` prefixing via a small build/runtime scoper, or rendered inside the wrapper so it can't reach the app chrome/editor). This lets Claude write bespoke layouts (grid overrides), pseudo-element decorations, and animations against the T1 tokens — enough to match the original Hawaii fidelity — with **no HTML/JS**.

**Security (T3 is public-facing — share links are open):** sanitize `custom_css` on write — strip `@import`, `</style>`/tag-breakouts, and (configurable) external `url()`; enforce the trip-root scope so it can't style the editor or other trips; size-cap it. Validated in the API layer and covered by tests.

**Workflow:** Claude (given the trip + the theming-API doc + a brief like the reference `design-prompt.md`) generates `{tokens, fonts, hero, layout, custom_css}` → calls MCP `set_theme` → `PATCH /api/trips/:id/themes` sanitizes, upserts, activates → client re-applies on next load/refetch. **Tier 4 (block system) and Tier 5 (sandboxed full templates) are the documented growth path, not built now.**

---

## MCP server (local stdio, PAT auth, HTTP-ready)
- `mcp/src/index.ts`: MCP SDK **stdio** transport. `client.ts`: thin REST client (`TRAVEL_API_URL` + `TRAVEL_PAT` env, `Authorization: Bearer`). `tools.ts`: tool defs validated by the **shared zod schemas**. Keep tools transport-agnostic (pure `(input)→REST call`) so an HTTP transport can wrap the same `tools.ts` later.
- **Tools:** `get_trip`, `list_trips`, `create_trip` (incl. `timezone`), `update_trip`, `add_lodging`/`update_lodging`/`remove_lodging`, `add_event`/`update_event`/`remove_event`, `add_review`/`remove_review`, `create_itinerary`/`duplicate_itinerary`/`update_itinerary`/`activate_itinerary`, `add_day`/`update_day`/`remove_day`, `add_day_item`/`update_day_item`/`remove_day_item`, `reorder_day`, `set_theme` (accepts the full layered `{tokens, fonts, hero, layout, custom_css}`)/`set_layout`/`set_custom_css` (focused updates)/`list_themes`/`activate_theme`, `create_share_link`. A `get_theming_api` tool returns the documented CSS hooks + layout-variant enums so the design agent knows exactly what it can target.

---

## PWA / offline (`vite-plugin-pwa`, Workbox)
- `manifest.webmanifest` (standalone, maskable 192/512 icons, theme color from active theme), `registerType:"autoUpdate"` + "update available" toast.
- Precache the app shell; **StaleWhileRevalidate** for `GET /api/shared/*` and `GET /api/trips/*` reads (instant offline viewing of a shared trip — the core offline use case); `NetworkOnly` for mutations. Optional later: Workbox Background Sync to replay offline edits.

---

## Dokku deployment
- **Single app, single container.** `git push dokku main` → Dokku builds the `Dockerfile` and runs the long-lived Express process. Express serves the API under `/api/*` and the built React SPA (`client/dist`) for everything else (static + SPA fallback to `index.html`).
- **`Dockerfile`** (multi-stage): install workspace deps → `npm run build` (compile `shared` + `server` to JS, build `client` with Vite) → slim runtime stage with prod deps + built artifacts. `CMD` runs the server (or rely on the `Procfile web:` entry).
- **`Procfile`:** `web: node server/dist/index.js` and `release: npm run migrate:prod`. Dokku runs the `release` phase on every deploy → **migrations apply automatically before the new release goes live** (normal, unlike serverless).
- **Postgres:** `dokku postgres:create travel-plan-db` + `dokku postgres:link travel-plan-db travel-plan` injects `DATABASE_URL`. App uses it with a **normal pool** (`pool {min:2,max:10}`); `db.ts` stays a module singleton. Backups via `dokku postgres:backup` to S3 on a cron.
- **TLS & domain:** point a (sub)domain at the Dokku host; `dokku domains:set`, then `dokku letsencrypt:enable travel-plan` for HTTPS (+ auto-renew cron).
- **Env/secrets:** `dokku config:set` for `GOOGLE_CLIENT_ID`/secret, `SESSION_SECRET`, `NODE_ENV=production`, app base URL (for OAuth redirect + share links). Register the app's HTTPS domain as an authorized Google OAuth origin/redirect.
- **No serverless concerns:** prod == dev — same Knex/Express/Postgres, no `serverless-http`, no pooler, no cold starts. The app stays standard Node+Postgres, portable to any host later.

---

## Testing (Jest + Supertest)
- Integration-first: import `createApp()`, run against **in-memory SQLite**; `tests/setup.ts` does `migrate.latest()` on a fresh `:memory:` DB per suite, seeds minimal fixtures, tears down.
- Cover: trip/event/lodging/itinerary CRUD; `day_items` ordering + `reorder`; **time model** (timed-vs-bucket interleave ordering, `time_of_day` enum + `HH:MM` validation, wall-clock values are stored/returned unchanged regardless of process/server timezone); **auth boundaries** (viewer token cannot mutate; user/token cannot cross trips; PAT works as host); theme upsert/active-flag; **theme `custom_css` sanitization + scoping** (strips `@import`/tag-breakout, rejects/rescopes editor-targeting selectors, size cap) and **`layout` zod validation** (unknown variants rejected); Google-auth handler with a mocked verifier.
- MCP: unit-test `tools.ts` with a mocked REST client (assert each tool → correct HTTP call + payload).

---

## Phased build sequence
1. **Foundation:** workspaces, `shared` types+zod, `knexfile.ts`, `server/src/app.ts` + `db.ts`, migrations. Verify `migrate:latest` on SQLite.
2. **Data + import:** export Hawaii `ACT/REGION/PLANS` + CSV → `seeds/data/hawaii.json`; write `01_hawaii_trip.ts`; load locally (prints owner email, trip, share URL). Validates schema on real data.
3. **API + auth + tests:** routes + `resolveAuth`/`requireOwner` + Google login + PAT; full Supertest suite (incl. auth boundaries + reorder). This is the contract everything depends on — make it solid before UI.
4. **React viewer + theming (T1–T3):** Vite+Tailwind, `ThemeProvider` (CSS vars from `tokens`/`fonts`/`hero`), `TripView` read-only reproducing the Hawaii viewer (day cards, activity cards, detail sheet, region colors) for the **active** itinerary; the variant switcher renders only when >1 itinerary exists (defer the rich compare/switch UI). Bake in the **stable theming API** (documented `.tp-*` classes + `data-*` hooks), the **T2 layout variants** (hero/day/section options), and the **scoped+sanitized `custom_css` injection** (T3). Document the hooks/variants in the README.
5. **Editor + PWA:** logged-in `TripEdit` CRUD; then `vite-plugin-pwa` (manifest, precache, SWR for reads, install prompt).
6. **MCP server:** stdio + REST client + tools; unit tests; exercise the design-apply loop end-to-end against the local API.
7. **Dokku deploy:** `Dockerfile` + `Procfile` (Express serves the SPA), `dokku postgres:create`/`link`, domain + Let's Encrypt, `config:set` secrets; `git push dokku main` runs the `release` migrate then goes live. Verify on a real device.

---

## Verification
- **Local dev:** `npm run db:reset` (migrate + seed Hawaii) then `npm run dev` (Express :3001 + Vite :5173 proxying `/api`). Open the printed share URL → see the Hawaii trip; sign in with Google → edit it.
- **Tests:** `npm test` (Jest + Supertest on in-memory SQLite) green, including auth-boundary and reorder cases.
- **MCP loop:** run `npm run mcp` with a dev PAT; from an agent call `get_trip`, `add_event`, `reorder_day`, `get_theming_api`, then `set_theme` with a full Claude-generated design (`tokens` + `layout` variant change + bespoke `custom_css`) → reload the client and confirm the new event AND the restructured/re-skinned design appear. Confirm a malicious `custom_css` (e.g. `@import`, tag-breakout, editor-targeting selector) is rejected/scoped.
- **PWA/offline:** build the client, install to home screen, load a shared trip, go offline → trip still renders.
- **Prod:** `git push dokku main` builds and deploys; the `release` phase applies migrations; HTTPS is live via Let's Encrypt; `/api/*` and the SPA are served by the one Express process; share link + offline work on a phone.
