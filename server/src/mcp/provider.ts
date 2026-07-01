import type { Response } from 'express';
import type { Knex } from 'knex';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { InvalidGrantError, InvalidRequestError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

import { SESSION_COOKIE, verifySession } from '../auth/session';
import { OAuthStore, nowEpochSeconds } from './store';
import {
  signAccessToken,
  verifyAccessToken as verifyAccessJwt,
  generateRefreshToken,
  hashToken,
  generateAuthCode,
} from './tokens';

const AUTH_CODE_TTL_SECONDS = 5 * 60; // 5 min
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface McpOAuthConfig {
  /** Public base URL of this authorization server (where /authorize, /token live). */
  issuerUrl: string;
  /** Base URL of the SPA that hosts the Google login page (for the login bounce). */
  loginBaseUrl: string;
}

/**
 * OAuth 2.1 provider for the remote MCP endpoint. Identity is delegated to the
 * app's existing Google login: `authorize` requires a valid `tp_session`
 * cookie (bouncing through the SPA login if absent), then issues an
 * authorization code. Access tokens are self-contained JWTs; refresh tokens
 * are stored hashed. PKCE (S256) is validated by the MCP SDK's token handler
 * via `challengeForAuthorizationCode`.
 */
export class McpOAuthProvider implements OAuthServerProvider {
  private store: OAuthStore;

  constructor(
    db: Knex,
    private config: McpOAuthConfig,
  ) {
    this.store = new OAuthStore(db);
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (clientId) => this.store.getClient(clientId),
      registerClient: (client) => this.store.registerClient(client as OAuthClientInformationFull),
    };
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    // Identify the user from the existing Google session cookie.
    const req = res.req;
    const userId = verifySession(req.cookies?.[SESSION_COOKIE]);

    if (!userId) {
      // Not signed in: bounce through the SPA login, which returns here (now
      // with a session cookie) via ?returnTo.
      const authorizeUrl = `${trimSlash(this.config.issuerUrl)}${req.originalUrl}`;
      const loginUrl = `${trimSlash(this.config.loginBaseUrl)}/login?returnTo=${encodeURIComponent(authorizeUrl)}`;
      res.redirect(loginUrl);
      return;
    }

    // Signed in: issue an authorization code and redirect back to the client.
    // (Personal/family app — authenticated == consented; no separate screen.)
    const code = generateAuthCode();
    const scope = (params.scopes ?? []).join(' ');
    await this.store.saveAuthCode({
      code,
      clientId: client.client_id,
      userId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scope,
      resource: params.resource?.toString(),
      ttlSeconds: AUTH_CODE_TTL_SECONDS,
    });

    const redirect = new URL(params.redirectUri);
    redirect.searchParams.set('code', code);
    if (params.state !== undefined) redirect.searchParams.set('state', params.state);
    res.redirect(redirect.toString());
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const row = await this.store.getAuthCode(authorizationCode);
    if (!row || row.client_id !== client.client_id) throw new InvalidGrantError('Invalid authorization code');
    if (row.expires_at < nowEpochSeconds()) {
      await this.store.consumeAuthCode(authorizationCode);
      throw new InvalidGrantError('Authorization code expired');
    }
    return row.code_challenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const row = await this.store.getAuthCode(authorizationCode);
    if (!row || row.client_id !== client.client_id) throw new InvalidGrantError('Invalid authorization code');
    if (row.expires_at < nowEpochSeconds()) {
      await this.store.consumeAuthCode(authorizationCode);
      throw new InvalidGrantError('Authorization code expired');
    }
    if (redirectUri !== undefined && redirectUri !== row.redirect_uri) {
      throw new InvalidGrantError('redirect_uri mismatch');
    }
    // One-time use.
    await this.store.consumeAuthCode(authorizationCode);
    return this.issueTokens(client.client_id, row.user_id, row.scope);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const row = await this.store.getRefreshToken(hashToken(refreshToken));
    if (!row || row.client_id !== client.client_id) throw new InvalidGrantError('Invalid refresh token');
    if (row.expires_at !== null && row.expires_at < nowEpochSeconds()) {
      await this.store.deleteRefreshToken(hashToken(refreshToken));
      throw new InvalidGrantError('Refresh token expired');
    }
    // Down-scoping only: requested scopes must be a subset of the granted set.
    const granted = row.scope.split(' ').filter(Boolean);
    let scope = row.scope;
    if (scopes && scopes.length) {
      if (!scopes.every((s) => granted.includes(s))) throw new InvalidRequestError('Requested scope exceeds original grant');
      scope = scopes.join(' ');
    }
    // Rotate the refresh token.
    await this.store.deleteRefreshToken(hashToken(refreshToken));
    return this.issueTokens(client.client_id, row.user_id, scope);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const v = verifyAccessJwt(token);
    if (!v) throw new InvalidGrantError('Invalid or expired access token');
    return {
      token,
      clientId: v.clientId,
      scopes: v.scopes,
      expiresAt: v.expiresAt,
      extra: { userId: v.userId },
    };
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    // Access tokens are stateless JWTs (expire on their own); we can only
    // revoke refresh tokens. Silently ignore unknown/invalid tokens per spec.
    const hash = hashToken(request.token);
    const row = await this.store.getRefreshToken(hash);
    if (row && row.client_id === client.client_id) await this.store.deleteRefreshToken(hash);
  }

  private async issueTokens(clientId: string, userId: string, scope: string): Promise<OAuthTokens> {
    const { token: accessToken, expiresInSeconds } = signAccessToken({ userId, clientId, scope });
    const { plaintext: refreshToken, hash } = generateRefreshToken();
    await this.store.saveRefreshToken({
      tokenHash: hash,
      clientId,
      userId,
      scope,
      expiresAtEpoch: nowEpochSeconds() + REFRESH_TOKEN_TTL_SECONDS,
    });
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresInSeconds,
      scope: scope || undefined,
      refresh_token: refreshToken,
    };
  }
}

function trimSlash(u: string): string {
  return u.replace(/\/$/, '');
}
