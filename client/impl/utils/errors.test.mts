import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import {
  ConflictError,
  isTransientAuthError,
  NotFoundError,
  OperationError,
  RetryableError,
  ValidationError,
  createResponseError,
  isConflictError
} from './errors.mts'

suite('errors', () => {
  test('NotFoundError exposes docId and message', () => {
    const err = new NotFoundError('doc-123')
    assert.strictEqual(err.name, 'NotFoundError')
    assert.strictEqual(err.message, 'Document not found')
    assert.strictEqual(err.docId, 'doc-123')
    assert.strictEqual(err.statusCode, 404)
    assert.strictEqual(err.retryable, false)
  })

  test('ConflictError exposes machine-readable fields', () => {
    const err = new ConflictError('doc-456', { operation: 'put' })
    assert.strictEqual(err.message, 'Document update conflict')
    assert.strictEqual(err.docId, 'doc-456')
    assert.strictEqual(err.statusCode, 409)
    assert.strictEqual(err.couchError, 'conflict')
    assert.strictEqual(err.operation, 'put')
  })

  test('ValidationError preserves issues and operation context', () => {
    const err = new ValidationError({
      docId: 'doc-789',
      issues: [{ message: 'expected number', path: ['count'] }],
      message: 'Document validation failed',
      operation: 'get'
    })
    assert.strictEqual(err.name, 'ValidationError')
    assert.strictEqual(err.message, 'Document validation failed')
    assert.strictEqual(err.docId, 'doc-789')
    assert.strictEqual(err.operation, 'get')
    assert.strictEqual(err.retryable, false)
    assert.deepStrictEqual(err.issues, [{ message: 'expected number', path: ['count'] }])
  })

  test('RetryableError.isRetryableStatusCode identifies retryable statuses', () => {
    const retryable = [408, 429, 500, 502, 503, 504]
    for (const status of retryable) {
      assert.strictEqual(RetryableError.isRetryableStatusCode(status), true)
    }
    assert.strictEqual(RetryableError.isRetryableStatusCode(404), false)
    assert.strictEqual(RetryableError.isRetryableStatusCode(undefined), false)
  })

  test('isTransientAuthError only retries auth failures on the first attempt', () => {
    assert.strictEqual(isTransientAuthError({ statusCode: 401 }, 0), true)
    assert.strictEqual(isTransientAuthError({ statusCode: 403 }, 0), true)
    assert.strictEqual(isTransientAuthError({ statusCode: 401 }, 1), false)
    assert.strictEqual(isTransientAuthError({ statusCode: 500 }, 0), false)
    assert.strictEqual(isTransientAuthError(new Error('boom'), 0), false)
  })

  test('handleNetworkError wraps known network failures', () => {
    assert.throws(
      () => RetryableError.handleNetworkError({ code: 'ECONNRESET' }, 'query'),
      (err: unknown) =>
        err instanceof RetryableError &&
        err.statusCode === 503 &&
        err.message === 'Network request failed' &&
        err.operation === 'query'
    )
  })

  test('handleNetworkError rethrows unknown errors', () => {
    const original = new Error('boom')
    assert.throws(
      () => RetryableError.handleNetworkError(original),
      (err: unknown) => err === original
    )
  })

  test('handleNetworkError rethrows unrecognized network codes', () => {
    const networkErr = { code: 'UNKNOWN' }
    assert.throws(
      () => RetryableError.handleNetworkError(networkErr),
      (err: unknown) => err === networkErr
    )
  })

  test('isConflictError detects statusCode 409', () => {
    assert.strictEqual(isConflictError(new ConflictError('doc-123')), true)
    assert.strictEqual(isConflictError({ statusCode: 409 }), true)
    assert.strictEqual(isConflictError({ statusCode: 412 }), false)
    assert.strictEqual(isConflictError(null), false)
  })

  test('createResponseError sanitizes retryable and non-retryable errors', () => {
    const retryable = createResponseError({
      body: { error: 'maintenance_mode', reason: 'cluster is rebooting' },
      defaultMessage: 'Query failed',
      operation: 'query',
      statusCode: 503
    })
    assert.ok(retryable instanceof RetryableError)
    assert.strictEqual(retryable.message, 'Query failed: cluster is rebooting')
    assert.strictEqual(retryable.couchError, 'maintenance_mode')
    assert.strictEqual(retryable.couchReason, 'cluster is rebooting')
    assert.strictEqual(retryable.statusCode, 503)

    const operationError = createResponseError({
      body: { error: 'forbidden', reason: 'validation failed' },
      defaultMessage: 'Put failed',
      docId: 'doc-789',
      operation: 'put',
      statusCode: 403
    })
    assert.ok(operationError instanceof OperationError)
    assert.strictEqual(operationError.message, 'Put failed: validation failed')
    assert.strictEqual(operationError.statusCode, 403)
    assert.strictEqual(operationError.couchError, 'forbidden')
    assert.strictEqual(operationError.couchReason, 'validation failed')
    assert.strictEqual(operationError.docId, 'doc-789')
  })
})
