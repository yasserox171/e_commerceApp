/**
 * Errors the API throws on purpose. Anything else that reaches the error
 * handler is treated as a bug and reported as a generic 500 without leaking
 * internals to the client.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, 'bad_request', message, details);
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(401, 'unauthorized', message);
  }

  static forbidden(message = 'Not allowed'): ApiError {
    return new ApiError(403, 'forbidden', message);
  }

  static notFound(message = 'Not found'): ApiError {
    return new ApiError(404, 'not_found', message);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, 'conflict', message, details);
  }

  static unprocessable(message: string, details?: unknown): ApiError {
    return new ApiError(422, 'unprocessable_entity', message, details);
  }

  static payment(message: string, details?: unknown): ApiError {
    return new ApiError(402, 'payment_failed', message, details);
  }

  static internal(message = 'Internal server error', details?: unknown): ApiError {
    return new ApiError(500, 'internal_error', message, details);
  }

  static serviceUnavailable(message: string, details?: unknown): ApiError {
    return new ApiError(503, 'service_unavailable', message, details);
  }
}
