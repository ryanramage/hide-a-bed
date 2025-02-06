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

  static handleNetworkError(err) {
    const networkErrors = {
      ECONNREFUSED: 503,
      ECONNRESET: 503,
      ETIMEDOUT: 503,
      ENETUNREACH: 503,
      ENOTFOUND: 503,
      EPIPE: 503,
      EHOSTUNREACH: 503,
      ESOCKETTIMEDOUT: 503
    };

    if (err.code && networkErrors[err.code]) {
      throw new RetryableError(`Network error: ${err.code}`, networkErrors[err.code]);
    }
    throw err;
  }
}
