import { getCouchError } from './response.mts'

/**
 * Represents a network-level error emitted by Node.js or HTTP client libraries.
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

type ErrorWithCause = {
  cause?: unknown
}

export type ErrorCategory =
  | 'conflict'
  | 'network'
  | 'not_found'
  | 'operation'
  | 'retryable'
  | 'transaction'

export type ErrorOperation =
  | 'get'
  | 'getAtRev'
  | 'getDBInfo'
  | 'patch'
  | 'patchDangerously'
  | 'put'
  | 'query'
  | 'queryStream'
  | 'remove'
  | 'request'
  | 'watchDocs'

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

const getNestedNetworkError = (
  value: unknown
): (NetworkError & { code: NetworkErrorCode }) | null => {
  if (isNetworkError(value)) {
    return value
  }

  if (typeof value !== 'object' || value === null) {
    return null
  }

  const candidate = value as ErrorWithCause
  return isNetworkError(candidate.cause) ? candidate.cause : null
}

/**
 * Shared structured fields available on hide-a-bed operational errors.
 *
 * @public
 */
export type HideABedErrorOptions = {
  category: ErrorCategory
  cause?: unknown
  couchError?: string
  docId?: string
  operation?: ErrorOperation
  retryable: boolean
  statusCode?: number
}

/**
 * Shared base class for operational errors thrown by hide-a-bed.
 *
 * @public
 */
export class HideABedError extends Error {
  readonly category: ErrorCategory
  readonly couchError?: string
  readonly docId?: string
  readonly operation?: ErrorOperation
  readonly retryable: boolean
  readonly statusCode?: number

  constructor(message: string, options: HideABedErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'HideABedError'
    this.category = options.category
    this.couchError = options.couchError
    this.docId = options.docId
    this.operation = options.operation
    this.retryable = options.retryable
    this.statusCode = options.statusCode
  }
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
export class NotFoundError extends HideABedError {
  constructor(
    docId: string,
    options: Omit<Partial<HideABedErrorOptions>, 'category' | 'docId' | 'retryable'> & {
      message?: string
    } = {}
  ) {
    super(options.message ?? 'Document not found', {
      category: 'not_found',
      couchError: options.couchError ?? 'not_found',
      cause: options.cause,
      docId,
      operation: options.operation,
      retryable: false,
      statusCode: options.statusCode ?? 404
    })
    this.name = 'NotFoundError'
  }
}

/**
 * Error thrown when a single-document mutation conflicts with the current revision.
 *
 * @public
 */
export class ConflictError extends HideABedError {
  constructor(
    docId: string,
    options: Omit<Partial<HideABedErrorOptions>, 'category' | 'docId' | 'retryable'> & {
      message?: string
    } = {}
  ) {
    super(options.message ?? 'Document update conflict', {
      category: 'conflict',
      couchError: options.couchError ?? 'conflict',
      cause: options.cause,
      docId,
      operation: options.operation,
      retryable: false,
      statusCode: options.statusCode ?? 409
    })
    this.name = 'ConflictError'
  }
}

/**
 * Error thrown when an operation fails in a non-retryable way.
 *
 * @public
 */
export class OperationError extends HideABedError {
  constructor(
    message: string,
    options: Omit<Partial<HideABedErrorOptions>, 'category' | 'retryable'> & {
      category?: Extract<ErrorCategory, 'operation' | 'transaction'>
    } = {}
  ) {
    super(message, {
      category: options.category ?? 'operation',
      cause: options.cause,
      couchError: options.couchError,
      docId: options.docId,
      operation: options.operation,
      retryable: false,
      statusCode: options.statusCode
    })
    this.name = 'OperationError'
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
export class RetryableError extends HideABedError {
  constructor(
    message: string,
    statusCode?: number,
    options: Omit<Partial<HideABedErrorOptions>, 'category' | 'retryable' | 'statusCode'> & {
      category?: Extract<ErrorCategory, 'network' | 'retryable'>
    } = {}
  ) {
    super(message, {
      category: options.category ?? 'retryable',
      cause: options.cause,
      couchError: options.couchError,
      docId: options.docId,
      operation: options.operation,
      retryable: true,
      statusCode
    })
    this.name = 'RetryableError'
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
  static handleNetworkError(err: unknown, operation: ErrorOperation = 'request'): never {
    const networkError = getNestedNetworkError(err)

    if (networkError) {
      const statusCode = NETWORK_ERROR_STATUS_MAP[networkError.code]
      if (statusCode) {
        throw new RetryableError('Network request failed', statusCode, {
          category: 'network',
          cause: err,
          operation
        })
      }
    }

    throw err
  }
}

type ResponseErrorOptions = {
  body?: unknown
  defaultMessage: string
  docId?: string
  notFoundMessage?: string
  operation: ErrorOperation
  statusCode?: number
}

export function createResponseError({
  body,
  defaultMessage,
  docId,
  notFoundMessage,
  operation,
  statusCode
}: ResponseErrorOptions): HideABedError {
  const couchError = getCouchError(body)

  if (statusCode === 404 && docId) {
    return new NotFoundError(docId, {
      couchError,
      message: notFoundMessage,
      operation,
      statusCode
    })
  }

  if (statusCode === 409 && docId) {
    return new ConflictError(docId, {
      couchError,
      operation,
      statusCode
    })
  }

  if (RetryableError.isRetryableStatusCode(statusCode)) {
    return new RetryableError(defaultMessage, statusCode, {
      couchError,
      operation
    })
  }

  return new OperationError(defaultMessage, {
    couchError,
    docId,
    operation,
    statusCode
  })
}

export function isConflictError(err: unknown): boolean {
  if (err instanceof ConflictError) return true
  if (typeof err !== 'object' || err === null) return false
  const candidate = err as { statusCode?: unknown }
  return candidate.statusCode === 409
}
