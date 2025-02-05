// @ts-check

export class RetryableError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'RetryableError';
    this.statusCode = statusCode;
  }

  static isRetryableStatusCode(statusCode) {
    return [408, 429, 500, 502, 503, 504].includes(statusCode);
  }
}
