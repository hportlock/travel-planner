import type { IncomingMessage } from 'node:http';
import type { Express, Request, Response } from 'express';
import type { Knex } from 'knex';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { createMcpServer } from '@travel-plan/mcp';

import { McpOAuthProvider } from './provider';
import { internalClientForUser } from './internalClient';

const MCP_PATH = '/mcp';

/**
 * Mounts the remote MCP endpoint and its OAuth 2.1 authorization server into
 * the existing Express app:
 *   - `mcpAuthRouter` at root → /authorize, /token, /register, /revoke and the
 *     `.well-known` discovery metadata claude.ai follows.
 *   - `POST /mcp` → the Streamable HTTP transport, guarded by a Bearer check
 *     that verifies the access token and scopes the tools to that user.
 *
 * Must be called before the SPA catch-all (`app.get('*')`) so it can't swallow
 * `/authorize` and `/.well-known/*`.
 */
export function mountMcp(app: Express, db: Knex): void {
  const port = Number(process.env.PORT || 3001);
  const isProd = process.env.NODE_ENV === 'production';
  // Where /authorize + /token live (this server). In prod the SPA and API are
  // same-origin, so APP_BASE_URL works; in dev set MCP_PUBLIC_URL=http://localhost:3001.
  const issuer =
    process.env.MCP_PUBLIC_URL ||
    (isProd ? process.env.APP_BASE_URL : undefined) ||
    `http://localhost:${port}`;
  // SPA base that hosts the Google login page (for the unauthenticated bounce).
  const loginBaseUrl = process.env.APP_BASE_URL || issuer;
  const mcpUrl = `${issuer.replace(/\/$/, '')}${MCP_PATH}`;

  const provider = new McpOAuthProvider(db, { issuerUrl: issuer, loginBaseUrl });

  // Keep the SDK's per-endpoint rate limiting, but silence its `trust proxy`
  // validation warning: the app sits behind a single known proxy (Dokku nginx)
  // that sets X-Forwarded-For, so trusting it to derive the client IP is correct.
  const rateLimit = { validate: { trustProxy: false } };
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: new URL(issuer),
      resourceServerUrl: new URL(mcpUrl),
      scopesSupported: ['mcp'],
      resourceName: 'Travel Plan',
      authorizationOptions: { rateLimit },
      tokenOptions: { rateLimit },
      clientRegistrationOptions: { rateLimit },
      revocationOptions: { rateLimit },
    }),
  );

  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(mcpUrl));

  const handleMcp = async (req: Request, res: Response): Promise<void> => {
    // Verify the Bearer access token ourselves (we deliberately do NOT use the
    // SDK's requireBearerAuth, whose global `req.auth: AuthInfo` augmentation
    // would clash with the app's own `req.auth: AuthContext`).
    const authz = req.header('authorization');
    const token = authz && authz.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : '';
    let userId: string;
    try {
      const info = await provider.verifyAccessToken(token);
      userId = String(info.extra?.userId ?? '');
      if (!userId) throw new Error('no user');
    } catch {
      res
        .status(401)
        .set('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`)
        .json({ error: 'invalid_token', error_description: 'Missing or invalid access token' });
      return;
    }

    // Stateless: a fresh transport + server per request, tools scoped to this
    // user. enableJsonResponse avoids SSE, so proxy buffering is a non-issue.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createMcpServer(() => internalClientForUser(userId));
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    // Cast past the SDK's `auth?: AuthInfo` field on the request type: Express's
    // `req.auth` is the app's AuthContext, and we carry the user via `userId`
    // above rather than the SDK's request-attached auth.
    await transport.handleRequest(req as unknown as IncomingMessage, res, req.body);
  };

  app.post(MCP_PATH, handleMcp);
  app.get(MCP_PATH, handleMcp);
  app.delete(MCP_PATH, handleMcp);
}
