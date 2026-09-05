import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { isProduction } from '../config/env.js';
import { ApiError } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'not_found', message: `No route for ${req.method} ${req.originalUrl}` },
  });
};

/** Postgres error codes we can turn into something the client can act on. */
const PG_ERROR_MESSAGES: Record<string, { status: number; code: string; message: string }> = {
  '23505': { status: 409, code: 'conflict', message: 'This record already exists' },
  '23503': { status: 409, code: 'conflict', message: 'Referenced record does not exist' },
  '23514': { status: 422, code: 'constraint_violation', message: 'The request violates a data constraint' },
  '42P01': { status: 503, code: 'schema_missing', message: 'Database schema is not migrated — run `npm run db:migrate`' },
  '3D000': { status: 503, code: 'database_unavailable', message: 'Database does not exist' },
  '28P01': { status: 503, code: 'database_unavailable', message: 'Database authentication failed' },
  ECONNREFUSED: { status: 503, code: 'database_unavailable', message: 'Cannot reach the database' },
  ETIMEDOUT: { status: 503, code: 'database_unavailable', message: 'Database connection timed out' },
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (res.headersSent) return;

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_failed',
        message: 'One or more fields are invalid',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    });
    return;
  }

  const pgCode = (error as { code?: string }).code;
  const mapped = pgCode ? PG_ERROR_MESSAGES[pgCode] : undefined;
  if (mapped) {
    console.error(`[api] ${req.method} ${req.originalUrl} → pg ${pgCode}:`, (error as Error).message);
    res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    return;
  }

  // Anything reaching here is a bug. Log it in full, tell the client nothing.
  console.error(`[api] unhandled error on ${req.method} ${req.originalUrl}:`, error);
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Internal server error',
      ...(isProduction ? {} : { details: (error as Error).message }),
    },
  });
};
