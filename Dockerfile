# Multi-stage build of the workspaces monorepo; runs the long-lived Express server.
# Stage 1: install all workspace deps + build shared, server, client.
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Root manifests + per-workspace manifests first (better layer caching).
COPY package.json package-lock.json* ./
COPY tsconfig.base.json tsconfig.json tsconfig.migrate.json knexfile.ts ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY mcp/package.json ./mcp/
COPY client/package.json ./client/

# Install everything (workspaces). Use npm install since lockfile may evolve.
RUN npm install --workspaces --include-workspace-root

# Now copy sources and build. `npm run build` builds shared → mcp → server →
# client → migrations in dependency order (server imports @travel-plan/mcp).
COPY shared ./shared
COPY mcp ./mcp
COPY server ./server
COPY client ./client
COPY migrations ./migrations
COPY seeds ./seeds
RUN npm run build

# Stage 2: slim runtime with prod deps + built artifacts.
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY mcp/package.json ./mcp/
COPY server/package.json ./server/

# Production deps only (root + shared + mcp + server). The server imports the
# mcp workspace (@travel-plan/mcp) and @modelcontextprotocol/sdk at runtime, so
# the mcp workspace must be installed for its deps (sdk, zod-to-json-schema).
RUN npm install --omit=dev --workspace @travel-plan/server --workspace @travel-plan/mcp --include-workspace-root

# Built JS + assets. dist-migrate holds the compiled knexfile + migrations the
# release task runs (npm run migrate:prod) — no TypeScript loader needed at runtime.
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/mcp/dist ./mcp/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/dist-migrate ./dist-migrate

EXPOSE 3001
CMD ["node", "server/dist/index.js"]
