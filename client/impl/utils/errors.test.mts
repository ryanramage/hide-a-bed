import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { NotFoundError, RetryableError, isConflictError } from './errors.mts'

suite('errors', () => {
  test('NotFoundError exposes docId and message', () => {
    const err = new NotFoundError('doc-123')
    assert.strictEqual(err.name, 'NotFoundError')
    assert.strictEqual(err.message, 'Document not found')
    assert.strictEqual(err.docId, 'doc-123')
  })

  test('NotFoundError accepts custom message', () => {
    const err = new NotFoundError('doc-456', 'missing doc')
    assert.strictEqual(err.message, 'missing doc')
  })

  test('RetryableError.isRetryableStatusCode identifies retryable statuses', () => {
    const retryable = [408, 429, 500, 502, 503, 504]
    for (const status of retryable) {
      assert.strictEqual(RetryableError.isRetryableStatusCode(status), true)
    }
    assert.strictEqual(RetryableError.isRetryableStatusCode(404), false)
    assert.strictEqual(RetryableError.isRetryableStatusCode(undefined), false)
  })

  test('handleNetworkError wraps known network failures', () => {
    assert.throws(
      () => RetryableError.handleNetworkError({ code: 'ECONNRESET' }),
      (err: unknown) =>
        err instanceof RetryableError &&
        err.statusCode === 503 &&
        err.message.includes('ECONNRESET')
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
    assert.strictEqual(isConflictError({ statusCode: 409 }), true)
    assert.strictEqual(isConflictError({ statusCode: 412 }), false)
    assert.strictEqual(isConflictError(null), false)
  })
})
