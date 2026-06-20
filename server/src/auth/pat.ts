import { createHash, randomBytes } from 'crypto';

const PREFIX = 'tp_pat_';

/** Mint a new PAT: returns the plaintext (shown once) and its stored hash. */
export function generatePat(): { plaintext: string; hash: string } {
  const plaintext = PREFIX + randomBytes(24).toString('base64url');
  return { plaintext, hash: hashPat(plaintext) };
}

/** SHA-256 hex of a PAT plaintext. We store only the hash. */
export function hashPat(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export function looksLikePat(token: string | undefined): boolean {
  return !!token && token.startsWith(PREFIX);
}
