import request from 'supertest';
import type { Server } from 'http';
import { createHash, randomBytes } from 'crypto';
import { makeTestApp, destroyTestApp, createUser, sessionCookie, createTrip, type TestCtx } from './helpers';

/**
 * Remote MCP endpoint + its OAuth 2.1 authorization server. Drives the flow
 * claude.ai follows: discovery metadata → dynamic client registration →
 * authorization-code + PKCE → access token → authenticated MCP tool call
 * (scoped to the signed-in user via the loopback REST client).
 */

const b64url = (buf: Buffer): string => buf.toString('base64url');
function pkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

const MCP_ACCEPT = 'application/json, text/event-stream';

let ctx: TestCtx;
let httpServer: Server;
let prevInternalUrl: string | undefined;

beforeAll(async () => {
  ctx = await makeTestApp();
  // The MCP tools run against a loopback REST client, so the app must actually
  // be listening. Point the in-process client at this real ephemeral port.
  httpServer = await new Promise<Server>((resolve) => {
    const s = ctx.app.listen(0, () => resolve(s));
  });
  const port = (httpServer.address() as { port: number }).port;
  prevInternalUrl = process.env.INTERNAL_API_URL;
  process.env.INTERNAL_API_URL = `http://127.0.0.1:${port}`;
});
afterAll(async () => {
  process.env.INTERNAL_API_URL = prevInternalUrl;
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await destroyTestApp(ctx);
});

describe('OAuth discovery metadata', () => {
  it('advertises the authorization server metadata', async () => {
    const res = await request(ctx.app).get('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    expect(res.body.issuer).toBeDefined();
    expect(res.body.authorization_endpoint).toMatch(/\/authorize$/);
    expect(res.body.token_endpoint).toMatch(/\/token$/);
    expect(res.body.registration_endpoint).toMatch(/\/register$/);
    expect(res.body.code_challenge_methods_supported).toContain('S256');
  });

  it('advertises the protected-resource metadata for /mcp', async () => {
    const res = await request(ctx.app).get('/.well-known/oauth-protected-resource/mcp');
    expect(res.status).toBe(200);
    expect(res.body.resource).toMatch(/\/mcp$/);
    expect(Array.isArray(res.body.authorization_servers)).toBe(true);
  });
});

describe('dynamic client registration', () => {
  it('registers a public PKCE client and returns a client_id', async () => {
    const res = await request(ctx.app)
      .post('/register')
      .send({
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: 'Test Connector',
      });
    expect(res.status).toBe(201);
    expect(res.body.client_id).toBeDefined();
    expect(res.body.redirect_uris).toEqual(['https://claude.ai/api/mcp/auth_callback']);
  });
});

/** Registers a client, then drives /authorize + /token to obtain tokens. */
async function obtainTokens(userId: string): Promise<{ accessToken: string; refreshToken: string; clientId: string }> {
  const redirectUri = 'https://claude.ai/api/mcp/auth_callback';
  const reg = await request(ctx.app)
    .post('/register')
    .send({
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  expect(reg.status).toBe(201);
  const clientId = reg.body.client_id as string;

  const { verifier, challenge } = pkce();
  const authRes = await request(ctx.app)
    .get('/authorize')
    .set('Cookie', sessionCookie(userId))
    .query({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz',
      scope: 'mcp',
    });
  expect(authRes.status).toBe(302);
  const location = new URL(authRes.headers.location);
  expect(location.origin + location.pathname).toBe(redirectUri);
  expect(location.searchParams.get('state')).toBe('xyz');
  const code = location.searchParams.get('code');
  expect(code).toBeTruthy();

  const tokenRes = await request(ctx.app)
    .post('/token')
    .type('form')
    .send({
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    });
  expect(tokenRes.status).toBe(200);
  expect(tokenRes.body.token_type).toBe('Bearer');
  expect(tokenRes.body.access_token).toBeDefined();
  expect(tokenRes.body.refresh_token).toBeDefined();
  return { accessToken: tokenRes.body.access_token, refreshToken: tokenRes.body.refresh_token, clientId };
}

describe('authorization-code + PKCE flow', () => {
  it('bounces an unauthenticated /authorize (valid client) to the login page', async () => {
    const redirectUri = 'https://claude.ai/api/mcp/auth_callback';
    const reg = await request(ctx.app)
      .post('/register')
      .send({ redirect_uris: [redirectUri], token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'] });
    const { challenge } = pkce();
    const res = await request(ctx.app).get('/authorize').query({
      response_type: 'code',
      client_id: reg.body.client_id,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login\?returnTo=/);
  });

  it('rejects a token exchange with the wrong PKCE verifier', async () => {
    const user = await createUser(ctx.db);
    const redirectUri = 'https://claude.ai/api/mcp/auth_callback';
    const reg = await request(ctx.app)
      .post('/register')
      .send({ redirect_uris: [redirectUri], token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'] });
    const clientId = reg.body.client_id as string;
    const { challenge } = pkce();
    const authRes = await request(ctx.app)
      .get('/authorize')
      .set('Cookie', sessionCookie(user.id))
      .query({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256' });
    const code = new URL(authRes.headers.location).searchParams.get('code')!;
    const bad = await request(ctx.app)
      .post('/token')
      .type('form')
      .send({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: 'not-the-verifier' });
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });

  it('issues tokens for a valid code + verifier', async () => {
    const user = await createUser(ctx.db);
    const { accessToken, refreshToken } = await obtainTokens(user.id);
    expect(accessToken.split('.')).toHaveLength(3); // JWT
    expect(refreshToken.startsWith('tp_rt_')).toBe(true);
  });

  it('exchanges a refresh token for a fresh access token', async () => {
    const user = await createUser(ctx.db);
    const { refreshToken, clientId } = await obtainTokens(user.id);
    const res = await request(ctx.app)
      .post('/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeDefined();
  });
});

describe('/mcp endpoint', () => {
  it('rejects an unauthenticated request with 401 + WWW-Authenticate', async () => {
    const res = await request(ctx.app)
      .post('/mcp')
      .set('Accept', MCP_ACCEPT)
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toMatch(/resource_metadata=/);
  });

  it('serves tools and scopes tool calls to the authenticated user', async () => {
    const alice = await createUser(ctx.db);
    const bob = await createUser(ctx.db);
    await createTrip(ctx.db, alice.id, { title: 'Alice Trip' });
    await createTrip(ctx.db, bob.id, { title: 'Bob Trip' });
    const { accessToken } = await obtainTokens(alice.id);

    const initialize = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'jest', version: '1.0.0' } },
    };
    const initRes = await request(ctx.app)
      .post('/mcp')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Accept', MCP_ACCEPT)
      .send(initialize);
    expect(initRes.status).toBe(200);
    expect(initRes.body.result.serverInfo.name).toBe('travel-plan');

    const listRes = await request(ctx.app)
      .post('/mcp')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Accept', MCP_ACCEPT)
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    expect(listRes.status).toBe(200);
    const toolNames = listRes.body.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('list_trips');

    const callRes = await request(ctx.app)
      .post('/mcp')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Accept', MCP_ACCEPT)
      .send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_trips', arguments: {} } });
    expect(callRes.status).toBe(200);
    const text = callRes.body.result.content[0].text as string;
    // Alice sees only her own trip — the loopback client is scoped by session JWT.
    expect(text).toContain('Alice Trip');
    expect(text).not.toContain('Bob Trip');
  });
});
