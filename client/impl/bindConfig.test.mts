import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { bindConfig, getBoundWithRetry } from './bindConfig.mts'
import { RetryableError } from './utils/errors.mts'
import { TEST_DB_URL } from '../test/setup-db.mts'
import { CouchConfig } from '../schema/config.mts'

suite('bindConfig', () => {
  test('validates config and rejects unknown keys', () => {
    assert.throws(
      () => {
        bindConfig({
          couch: TEST_DB_URL,
          // @ts-expect-error testing strict config validation
          extra: true
        })
      },
      (error: unknown) => {
        if (!(error instanceof Error)) return false
        const issues = (error as Error & { issues?: Array<{ message?: string }> }).issues
        return (
          Array.isArray(issues) && issues.some(issue => issue.message?.includes('Unrecognized key'))
        )
      }
    )
  })

  test('options returns a new binding without mutating the original config', async () => {
    const missingId = `bind-config-missing-${Date.now()}`
    const db = bindConfig({
      couch: TEST_DB_URL,
      throwOnGetNotFound: false,
      bindWithRetry: false
    })

    const strictDb = db.options({ throwOnGetNotFound: true })

    assert.notStrictEqual(strictDb, db)

    const originalResult = await db.get(missingId)
    assert.strictEqual(originalResult, null)

    await assert.rejects(
      () => strictDb.get(missingId),
      (error: unknown) => error instanceof Error && error.name === 'NotFoundError'
    )

    const originalResultAfterOverride = await db.get(missingId)
    assert.strictEqual(originalResultAfterOverride, null)
  })
})

suite('getBoundWithRetry', () => {
  test('retries retryable errors when bindWithRetry is enabled', async () => {
    let attempts = 0
    const bound = getBoundWithRetry<(value: string) => Promise<string>>(
      async (_config, value: string) => {
        attempts += 1
        if (attempts < 3) {
          throw new RetryableError('temporary failure', 503)
        }
        return value
      },
      CouchConfig.parse({
        couch: TEST_DB_URL,
        bindWithRetry: true,
        maxRetries: 3,
        initialDelay: 0,
        backoffFactor: 1
      })
    )

    const result = await bound('done')

    assert.strictEqual(result, 'done')
    assert.strictEqual(attempts, 3)
  })

  test('does not retry when bindWithRetry is disabled', async () => {
    let attempts = 0
    const bound = getBoundWithRetry<() => Promise<void>>(
      async () => {
        attempts += 1
        throw new RetryableError('temporary failure', 503)
      },
      CouchConfig.parse({
        couch: TEST_DB_URL,
        bindWithRetry: false
      })
    )

    await assert.rejects(
      () => bound(),
      (error: unknown) => error instanceof RetryableError && error.message === 'temporary failure'
    )
    assert.strictEqual(attempts, 1)
  })
})
