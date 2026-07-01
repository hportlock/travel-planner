import { RestClient, type RestClientLike } from '@travel-plan/mcp';
import { signSession } from '../auth/session';

/**
 * Builds a REST client the MCP tools run against, scoped to one authenticated
 * user. It calls the same Express app over loopback so every tool call flows
 * through the real routes, `requireOwner`, and trip-scoping — the "one REST
 * contract" the SPA, stdio MCP, and tests all share. Auth is a freshly-minted
 * session JWT (accepted by the extended `resolveAuth` Bearer branch); no shared
 * PAT and no new DB rows.
 */
export function internalClientForUser(userId: string): RestClientLike {
  const port = Number(process.env.PORT || 3001);
  const baseUrl = process.env.INTERNAL_API_URL || `http://127.0.0.1:${port}`;
  return new RestClient(baseUrl, signSession(userId));
}
