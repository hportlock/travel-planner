# @travel-plan/client

The web client for the travel-planning app: a warm "postcard" itinerary viewer
with a read-only public share view, an owner editor, and Google sign-in. Built
with Vite + React + Tailwind, installable as a PWA.

## Development

From the repo root:

```bash
npm run dev        # runs server (:3001) + client (:5173) concurrently
```

Or just the client:

```bash
npm run dev --workspace @travel-plan/client
```

Vite serves on **http://localhost:5173** and proxies `/api/*` to the Express
server on **http://localhost:3001** (see `server.proxy` in `vite.config.ts`), so
the auth cookie and all REST calls work without CORS in development.

## Routes

| Path              | Page        | Notes                                            |
| ----------------- | ----------- | ------------------------------------------------ |
| `/`               | `Home`      | Lists the signed-in user's trips, else prompts login. |
| `/login`          | `Login`     | Google Identity Services button.                 |
| `/t/:shareToken`  | `ShareView` | Public, read-only trip viewer (`GET /api/shared/:token`). |
| `/trip/:id`       | `TripEdit`  | Owner editor (requires auth; 401 → `/login`).    |

## Theming

`ThemeProvider` renders a `#trip-root` wrapper and applies the trip's
`ThemeRow`: design tokens become CSS custom properties, `fonts.url` is injected
as a `<link>`, and `custom_css` is injected as a scoped `<style>` *inside* the
wrapper. Components expose the stable theming hooks (`.tp-hero`, `.tp-day`,
`.tp-activity`, `data-region`, `data-hero-variant`, etc.) documented by
`GET /api/theming-api`, so Claude-generated custom CSS can target them safely.

## Build / production

```bash
npm run build --workspace @travel-plan/client
```

Output is written to **`client/dist`**, which the Express server serves as
static assets in production (SPA fallback to `index.html`).

## PWA

`vite-plugin-pwa` (autoUpdate) precaches the app shell and adds runtime caching:
trip reads (`/api/shared/*`, `/api/trips/*` GET) use stale-while-revalidate so
the viewer works offline; POSTs are network-only. Real PNG icons must be added
under `public/` — see `public/README.txt`.

## Configuration

- `VITE_GOOGLE_CLIENT_ID` — Google OAuth client id for sign-in. Falls back to a
  placeholder; sign-in will not work until this is set.
