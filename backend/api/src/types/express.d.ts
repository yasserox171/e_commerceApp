import type { AuthUser } from '../domain/auth/auth.service.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth` / `optionalAuth`. Absent on anonymous requests. */
      user?: AuthUser;
    }
  }
}

export {};
