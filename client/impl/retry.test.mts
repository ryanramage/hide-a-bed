import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { withRetry } from './retry.mts'
import { RetryableError } from './utils/errors.mts'

suite('withRetry', () => {
  test('resolves when the wrapped function succeeds without retries', async () => {
    let count = 0
    const fn = async (value: string) => {
      count += 1
      return value
    }

    const wrapped = withRetry(fn)
    const result = await wrapped('ok')

    assert.strictEqual(result, 'ok')
    assert.strictEqual(count, 1)
  })

  test('retries on RetryableError until success', async () => {
    let attempts = 0
    const fn = async () => {
      attempts += 1
      if (attempts < 3) {
        throw new RetryableError('temporary', 503)
      }
      return 'done'
    }

    const wrapped = withRetry(fn, { initialDelay: 0, maxDelay: 0 })
    const result = await wrapped()

    assert.strictEqual(result, 'done')
    assert.strictEqual(attempts, 3)
  })

  test('propagates non retryable errors immediately', async () => {
    let attempts = 0
    const fn = async () => {
      attempts += 1
      throw new Error('fatal')
    }

    const wrapped = withRetry(fn, { initialDelay: 0, maxDelay: 0 })

    await assert.rejects(
      () => wrapped(),
      (err: unknown) => {
        return err instanceof Error && !(err instanceof RetryableError) && err.message === 'fatal'
      }
    )
    assert.strictEqual(attempts, 1)
  })

  test('throws after exceeding the maximum retries', async () => {
    let attempts = 0
    const fn = async () => {
      attempts += 1
      throw new RetryableError('still failing', 503)
    }

    const wrapped = withRetry(fn, {
      maxRetries: 2,
      initialDelay: 0,
      maxDelay: 0
    })

    await assert.rejects(
      () => wrapped(),
      (err: unknown) => {
        return err instanceof RetryableError && err.message === 'still failing'
      }
    )
    assert.strictEqual(attempts, 3)
  })
})
