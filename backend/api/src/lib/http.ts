import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 5 forwards rejected promises to the error middleware on its own, but
 * wrapping keeps the intent explicit and makes the handlers portable if the
 * router is ever mounted somewhere older.
 */
export function asyncHandler<
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>,
>(
  handler: (
    req: Request<Params, ResBody, ReqBody, ReqQuery>,
    res: Response<ResBody>,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler<Params, ResBody, ReqBody, ReqQuery> {
  return (req, res, next) => {
    handler(req as never, res as never, next).catch(next);
  };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export function paginate<T>(items: T[], page: number, pageSize: number, total: number): Paginated<T> {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}
