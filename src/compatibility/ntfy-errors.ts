export interface NtfyErrorResponse {
  code: number;
  http: number;
  error: string;
  link?: string;
}

export class NtfyError extends Error {
  public readonly httpStatus: number;
  public readonly ntfyCode: number;
  public readonly link?: string;

  constructor(httpStatus: number, ntfyCode: number, message: string, link?: string) {
    super(message);
    this.name = 'NtfyError';
    this.httpStatus = httpStatus;
    this.ntfyCode = ntfyCode;
    this.link = link;
  }

  toJSON(): NtfyErrorResponse {
    const res: NtfyErrorResponse = {
      code: this.ntfyCode,
      http: this.httpStatus,
      error: this.message,
    };
    if (this.link) {
      res.link = this.link;
    }
    return res;
  }
}

export function createBadRequestError(message: string): NtfyError {
  return new NtfyError(400, 40001, message);
}

export function createUnauthorizedError(message = 'Unauthorized'): NtfyError {
  return new NtfyError(401, 40101, message);
}

export function createForbiddenError(message = 'Forbidden'): NtfyError {
  return new NtfyError(403, 40301, message);
}

export function createNotFoundError(message = 'Not Found'): NtfyError {
  return new NtfyError(404, 40401, message);
}

export function createPayloadTooLargeError(message = 'Message exceeds size limit'): NtfyError {
  return new NtfyError(413, 41301, message);
}

export function createRateLimitError(message = 'Rate limit exceeded'): NtfyError {
  return new NtfyError(429, 42901, message);
}

export function createInternalServerError(message = 'Internal Server Error'): NtfyError {
  return new NtfyError(500, 50001, message);
}
