import type { AuthContext } from '@travel-plan/shared';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
