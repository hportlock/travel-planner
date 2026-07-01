import type { Knex } from 'knex';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { serializeJson, parseJson } from '../db';

/**
 * Knex-backed persistence for the MCP OAuth authorization server: registered
 * clients (dynamic client registration), short-lived authorization codes, and
 * hashed refresh tokens. Portable JSON handling (SQLite text / Postgres json)
 * via the shared serializeJson/parseJson helpers.
 */

function nowIso(): string {
  return new Date().toISOString();
}

export function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function rowToClient(r: any): OAuthClientInformationFull {
  return {
    client_id: r.client_id,
    client_secret: r.client_secret ?? undefined,
    client_id_issued_at: r.client_id_issued_at ?? undefined,
    client_secret_expires_at: r.client_secret_expires_at ?? undefined,
    redirect_uris: parseJson<string[]>(r.redirect_uris, []),
    token_endpoint_auth_method: r.token_endpoint_auth_method ?? undefined,
    grant_types: parseJson<string[]>(r.grant_types, []),
    response_types: parseJson<string[]>(r.response_types, []),
    scope: r.scope ?? undefined,
    client_name: r.client_name ?? undefined,
    ...parseJson<Record<string, unknown>>(r.metadata, {}),
  } as OAuthClientInformationFull;
}

export class OAuthStore {
  constructor(private db: Knex) {}

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const row = await this.db('oauth_clients').where({ client_id: clientId }).first();
    return row ? rowToClient(row) : undefined;
  }

  async registerClient(client: OAuthClientInformationFull): Promise<OAuthClientInformationFull> {
    const known = new Set([
      'client_id',
      'client_secret',
      'client_id_issued_at',
      'client_secret_expires_at',
      'redirect_uris',
      'token_endpoint_auth_method',
      'grant_types',
      'response_types',
      'scope',
      'client_name',
    ]);
    // Preserve any extra RFC 7591 fields the client sent under `metadata`.
    const metadata: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(client)) {
      if (!known.has(k)) metadata[k] = v;
    }
    const ts = nowIso();
    await this.db('oauth_clients').insert({
      client_id: client.client_id,
      client_secret: client.client_secret ?? null,
      client_id_issued_at: client.client_id_issued_at ?? null,
      client_secret_expires_at: client.client_secret_expires_at ?? null,
      redirect_uris: serializeJson(client.redirect_uris ?? []),
      token_endpoint_auth_method: client.token_endpoint_auth_method ?? null,
      grant_types: serializeJson(client.grant_types ?? []),
      response_types: serializeJson(client.response_types ?? []),
      scope: client.scope ?? null,
      client_name: client.client_name ?? null,
      metadata: serializeJson(metadata),
      created_at: ts,
      updated_at: ts,
    });
    return client;
  }

  // ---- Authorization codes ----

  async saveAuthCode(input: {
    code: string;
    clientId: string;
    userId: string;
    redirectUri: string;
    codeChallenge: string;
    scope: string;
    resource?: string;
    ttlSeconds: number;
  }): Promise<void> {
    const ts = nowIso();
    await this.db('oauth_auth_codes').insert({
      code: input.code,
      client_id: input.clientId,
      user_id: input.userId,
      redirect_uri: input.redirectUri,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
      scope: input.scope,
      resource: input.resource ?? null,
      expires_at: nowEpochSeconds() + input.ttlSeconds,
      created_at: ts,
      updated_at: ts,
    });
  }

  async getAuthCode(code: string): Promise<
    | {
        client_id: string;
        user_id: string;
        redirect_uri: string;
        code_challenge: string;
        scope: string;
        resource: string | null;
        expires_at: number;
      }
    | undefined
  > {
    return this.db('oauth_auth_codes').where({ code }).first();
  }

  async consumeAuthCode(code: string): Promise<void> {
    await this.db('oauth_auth_codes').where({ code }).del();
  }

  // ---- Refresh tokens ----

  async saveRefreshToken(input: {
    tokenHash: string;
    clientId: string;
    userId: string;
    scope: string;
    expiresAtEpoch?: number;
  }): Promise<void> {
    const ts = nowIso();
    await this.db('oauth_refresh_tokens').insert({
      token_hash: input.tokenHash,
      client_id: input.clientId,
      user_id: input.userId,
      scope: input.scope,
      expires_at: input.expiresAtEpoch ?? null,
      created_at: ts,
      updated_at: ts,
    });
  }

  async getRefreshToken(tokenHash: string): Promise<
    | { client_id: string; user_id: string; scope: string; expires_at: number | null }
    | undefined
  > {
    return this.db('oauth_refresh_tokens').where({ token_hash: tokenHash }).first();
  }

  async deleteRefreshToken(tokenHash: string): Promise<void> {
    await this.db('oauth_refresh_tokens').where({ token_hash: tokenHash }).del();
  }
}
