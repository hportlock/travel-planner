/**
 * Library entry for the `@travel-plan/mcp` package (package `main`/`types`).
 * Side-effect free — importing it does NOT start a server. The stdio
 * executable lives in `index.ts` (run via `npm run start`), which imports
 * from here. The Express `server` package also imports from here to mount the
 * same tools over an HTTP transport.
 */
export { createMcpServer } from './server.js';
export { tools, toolsByName } from './tools.js';
export type { ToolDef } from './tools.js';
export { RestClient, clientFromEnv } from './client.js';
export type { RestClientLike } from './client.js';
