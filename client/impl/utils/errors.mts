import { getCouchError, getReason } from './response.mts'
import type { StandardSchemaV1 } from '../../types/standard-schema.ts'
import { isObject } from '../../types/types.utils.ts'

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
  | 'validation'
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

export const hasStatusCode = (error: unknown): error is { statusCode: number } => {
  return isObject(error) && 'statusCode' in error && typeof error.statusCode === 'number'
}

export const isTransientAuthError = (error: unknown, attempt: number) => {
  if (!hasStatusCode(error)) return false
  if (attempt > 0) return false

  return error.statusCode === 401 || error.statusCode === 403
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
  couchReason?: string
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
  readonly couchReason?: string
  readonly docId?: string
  readonly operation?: ErrorOperation
  readonly retryable: boolean
  readonly statusCode?: number

  constructor(message: string, options: HideABedErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'HideABedError'
    this.category = options.category
    this.couchError = options.couchError
    this.couchReason = options.couchReason
    this.docId = options.docId
    this.operation = options.operation
    this.retryable = options.retryable
    this.statusCode = options.statusCode
  }
}

export type ValidationErrorOptions = Omit<
  Partial<HideABedErrorOptions>,
  'category' | 'retryable'
> & {
  issues: ReadonlyArray<StandardSchemaV1.Issue>
  message?: string
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
      couchReason: options.couchReason,
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
      couchReason: options.couchReason,
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
      couchReason: options.couchReason,
      docId: options.docId,
      operation: options.operation,
      retryable: false,
      statusCode: options.statusCode
    })
    this.name = 'OperationError'
  }
}

/**
 * Error thrown when schema validation fails for a document, row, key, or value.
 *
 * @public
 */
export class ValidationError extends HideABedError {
  readonly issues: ValidationErrorOptions['issues']

  constructor(options: ValidationErrorOptions) {
    super(options.message ?? 'Validation failed', {
      category: 'validation',
      cause: options.cause,
      couchError: options.couchError,
      couchReason: options.couchReason,
      docId: options.docId,
      operation: options.operation,
      retryable: false,
      statusCode: options.statusCode
    })
    this.name = 'ValidationError'
    this.issues = options.issues
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
      couchReason: options.couchReason,
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

const getResponseErrorMessage = (body: unknown, defaultMessage: string) => {
  const reason = getReason(body, '').trim()

  if (!reason || reason === defaultMessage) {
    return defaultMessage
  }

  return `${defaultMessage}: ${reason}`
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
  const couchReason = getReason(body, '').trim() || undefined
  const message = getResponseErrorMessage(body, defaultMessage)

  if (statusCode === 404 && docId) {
    return new NotFoundError(docId, {
      couchError,
      couchReason,
      message: notFoundMessage ? getResponseErrorMessage(body, notFoundMessage) : undefined,
      operation,
      statusCode
    })
  }

  if (statusCode === 409 && docId) {
    return new ConflictError(docId, {
      couchError,
      couchReason,
      message,
      operation,
      statusCode
    })
  }

  if (RetryableError.isRetryableStatusCode(statusCode)) {
    return new RetryableError(message, statusCode, {
      couchError,
      couchReason,
      operation
    })
  }

  return new OperationError(message, {
    couchError,
    couchReason,
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
