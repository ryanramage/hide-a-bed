// @ts-check

/**
 * @typedef {Object} NetworkError
 * @property {string} code - The error code
 * @property {string} [message] - Optional error message
 */

export class NotFoundError extends Error {
  /**
   * @param {string} docId - The ID of the document that wasn't found
   * @param {string} [message] - Optional error message
   */
  constructor (docId, message = 'Document not found') {
    super(message)
    this.name = 'NotFoundError'
    this.docId = docId
  }
}

export class RetryableError extends Error {
  /**
   * @param {string} message - The error message
   * @param {number|undefined} statusCode - The HTTP status code
   */
  constructor (message, statusCode) {
    super(message)
    this.name = 'RetryableError'
    this.statusCode = statusCode
  }

  /**
   * @param {number|undefined} statusCode - The HTTP status code to check
   * @returns {boolean} Whether the status code is retryable
   */
  static isRetryableStatusCode (statusCode) {
    if (statusCode === undefined) return false
    return [408, 429, 500, 502, 503, 504].includes(statusCode)
  }

  /**
   * @param {NetworkError | unknown} err - The network error to handle
   * @throws {RetryableError} If the error is retryable
   * @throws {Error} If the error is not retryable
   */
  static handleNetworkError (err) {
    /** @type {Record<string, number>} */
    const networkErrors = {
      ECONNREFUSED: 503,
      ECONNRESET: 503,
      ETIMEDOUT: 503,
      ENETUNREACH: 503,
      ENOTFOUND: 503,
      EPIPE: 503,
      EHOSTUNREACH: 503,
      ESOCKETTIMEDOUT: 503
    }

    // Type guard for NetworkError shape
    if (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string' && networkErrors[err.code]) {
      throw new RetryableError(`Network error: ${err.code}`, networkErrors[err.code])
    }
    throw err
  }
}
