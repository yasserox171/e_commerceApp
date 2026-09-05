import type { RequestHandler } from 'express';

import { ApiError } from '../lib/errors.js';
import { findUserById, verifyToken } from '../domain/auth/auth.service.js';
import type { Channel } from '../domain/products/product.mapper.js';

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!value || scheme?.toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
}

/**
 * Rejects the request unless a valid token maps to an active user. The user is
 * re-read from the database on every call so a deactivated account loses access
 * immediately rather than when its token happens to expire.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) {
    next(ApiError.unauthorized('Missing Authorization: Bearer <token> header'));
    return;
  }

  void (async () => {
    try {
      const payload = verifyToken(token);
      const user = await findUserById(payload.sub);
      if (!user) throw ApiError.unauthorized('Account no longer exists');
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  })();
};

/** Attaches `req.user` when a valid token is present, but never rejects. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) {
    next();
    return;
  }

  void (async () => {
    try {
      const payload = verifyToken(token);
      req.user = (await findUserById(payload.sub)) ?? undefined;
    } catch {
      // An expired or malformed token on an optional route is just anonymous.
    }
    next();
  })();
};

/**
 * Keeps the two apps apart: a wholesale token must not be able to place a
 * retail order, or vice versa.
 */
export function requireChannel(channel: Channel): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }
    if (req.user.accountType !== channel) {
      next(ApiError.forbidden(`This endpoint is only available to ${channel} accounts`));
      return;
    }
    next();
  };
}

export function currentUser(req: { user?: { id: string; accountType: Channel } }) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
