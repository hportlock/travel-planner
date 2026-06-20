import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
}

let client: OAuth2Client | null = null;
function getClient(): OAuth2Client {
  if (!client) client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  return client;
}

/**
 * Verifies a Google ID token (the `credential` from Google Identity Services)
 * and returns the profile. Exported as a standalone function so tests can mock
 * this module (`jest.mock('../auth/google')`) with a fake verifier.
 */
export async function verifyGoogleIdToken(credential: string): Promise<GoogleProfile> {
  const ticket = await getClient().verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error('Invalid Google token payload');
  }
  return {
    sub: payload.sub,
    email: payload.email,
    email_verified: payload.email_verified === true,
    name: payload.name || payload.email,
    picture: payload.picture,
  };
}
