/**
 * Represents a network-level error emitted by Node.js or libraries such as `needle`.
 *
 * @public
 */
export interface NetworkError {
  /**
   * Machine-readable error code describing the network failure.
   */
  code: string

  /**
   * Optional human-readable message supplied by the underlying library.
   */
  message?: string
}

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504])

const NETWORK_ERROR_STATUS_MAP = {
  ECONNREFUSED: 503,
  ECONNRESET: 503,
  ETIMEDOUT: 503,
  ENETUNREACH: 503,
  ENOTFOUND: 503,
  EPIPE: 503,
  EHOSTUNREACH: 503,
  ESOCKETTIMEDOUT: 503
} as const satisfies Record<string, number>

type NetworkErrorCode = keyof typeof NETWORK_ERROR_STATUS_MAP

const isNetworkError = (value: unknown): value is NetworkError & { code: NetworkErrorCode } => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { code?: unknown }
  return typeof candidate.code === 'string' && candidate.code in NETWORK_ERROR_STATUS_MAP
}

/**
 * Error thrown when a requested CouchDB document cannot be found.
 *
 * @remarks
 * The `docId` property exposes the identifier that triggered the failure, which is
 * helpful for logging and retry strategies.
 *
 * @public
 */
export class NotFoundError extends Error {
  /**
   * Identifier of the missing document.
   */
  readonly docId: string

  /**
   * Creates a new {@link NotFoundError} instance.
   *
   * @param docId - The identifier of the document that was not found.
   * @param message - Optional custom error message.
   */
  constructor(docId: string, message = 'Document not found') {
    super(message)
    this.name = 'NotFoundError'
    this.docId = docId
  }
}

/**
 * Error signalling that an operation can be retried due to transient conditions.
 *
 * @remarks
 * Use `RetryableError.isRetryableStatusCode` and `RetryableError.handleNetworkError`
 * to detect when a failure should trigger retry logic.
 *
 * @public
 */
export class RetryableError extends Error {
  /**
   * HTTP status code associated with the retryable failure, when available.
   */
  readonly statusCode?: number

  /**
   * Creates a new {@link RetryableError} instance.
   *
   * @param message - Detailed description of the failure.
   * @param statusCode - Optional HTTP status code corresponding to the failure.
   */
  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'RetryableError'
    this.statusCode = statusCode
  }

  /**
   * Determines whether the provided status code should be treated as retryable.
   *
   * @param statusCode - HTTP status code returned by CouchDB.
   *
   * @returns `true` if the status code is considered retryable; otherwise `false`.
   */
  static isRetryableStatusCode(statusCode: number | undefined): statusCode is number {
    if (typeof statusCode !== 'number') return false
    return RETRYABLE_STATUS_CODES.has(statusCode)
  }

  /**
   * Converts low-level network errors into {@link RetryableError} instances when possible.
   *
   * @param err - The error thrown by the underlying HTTP client.
   *
   * @throws {@link RetryableError} When the error maps to a retryable network condition.
   * @throws {*} Re-throws the original error when it cannot be mapped.
   */
  static handleNetworkError(err: unknown): never {
    if (isNetworkError(err)) {
      const statusCode = NETWORK_ERROR_STATUS_MAP[err.code]
      if (statusCode) {
        throw new RetryableError(`Network error: ${err.code}`, statusCode)
      }
    }

    throw err
  }
}

export function isConflictError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const candidate = err as { statusCode?: unknown }
  return candidate.statusCode === 409
}
