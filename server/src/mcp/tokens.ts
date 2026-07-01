import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';

/**
 * Access tokens for the remote MCP endpoint are self-contained JWTs (no DB
 * row): `verifyAccessToken` just verifies the signature + expiry. Refresh
 * tokens are opaque random strings stored hashed. Signed with MCP_TOKEN_SECRET,
 * falling back to SESSION_SECRET so a single-secret deploy still works.
 */
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1h

function secret(): string {
  return (
    process.env.MCP_TOKEN_SECRET ||
    process.env.SESSION_SECRET ||
    'dev-only-insecure-session-secret-change-me'
  );
}

export interface McpAccessClaims {
  userId: string;
  clientId: string;
  scope: string;
}

export function signAccessToken(claims: McpAccessClaims): { token: string; expiresInSeconds: number } {
  const token = jwt.sign(
    { typ: 'mcp_access', sub: claims.userId, cid: claims.clientId, scope: claims.scope },
    secret(),
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  );
  return { token, expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS };
}

export interface VerifiedAccessToken {
  userId: string;
  clientId: string;
  scopes: string[];
  expiresAt?: number;
}

export function verifyAccessToken(token: string): VerifiedAccessToken | null {
  try {
    const p = jwt.verify(token, secret()) as {
      typ?: string;
      sub?: string;
      cid?: string;
      scope?: string;
      exp?: number;
    };
    if (p.typ !== 'mcp_access' || !p.sub || !p.cid) return null;
    return {
      userId: p.sub,
      clientId: p.cid,
      scopes: (p.scope ?? '').split(' ').filter(Boolean),
      expiresAt: p.exp,
    };
  } catch {
    return null;
  }
}

/** Opaque refresh token: returns the plaintext (given to the client) + its hash (stored). */
export function generateRefreshToken(): { plaintext: string; hash: string } {
  const plaintext = 'tp_rt_' + randomBytes(32).toString('base64url');
  return { plaintext, hash: hashToken(plaintext) };
}

export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/** Opaque authorization code. */
export function generateAuthCode(): string {
  return 'tp_ac_' + randomBytes(32).toString('base64url');
}
