import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { CouchConfig } from './config.mts'

suite('CouchConfig', () => {
  test('applies defaults for retry and logging options', () => {
    const parsed = CouchConfig.parse({
      couch: 'http://localhost:5984'
    })

    assert.strictEqual(parsed.couch, 'http://localhost:5984')
    assert.strictEqual(parsed.bindWithRetry, true)
    assert.strictEqual(parsed.maxRetries, 3)
    assert.strictEqual(parsed.initialDelay, 1000)
    assert.strictEqual(parsed.backoffFactor, 2)
    assert.strictEqual(parsed.throwOnGetNotFound, false)
    assert.strictEqual(parsed.useConsoleLogger, false)
  })

  test('accepts object logger and needle options', () => {
    const logger = {
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {}
    }

    const parsed = CouchConfig.parse({
      couch: 'http://localhost:5984',
      logger,
      needleOpts: {
        timeout: 1234,
        headers: {
          authorization: 'Bearer token'
        }
      }
    })

    assert.ok(parsed.logger)
    assert.strictEqual(typeof parsed.logger, 'object')
    if (typeof parsed.logger === 'function') {
      assert.fail('expected object logger')
    }
    assert.strictEqual(typeof parsed.logger.error, 'function')
    assert.strictEqual(typeof parsed.logger.warn, 'function')
    assert.strictEqual(typeof parsed.logger.info, 'function')
    assert.strictEqual(typeof parsed.logger.debug, 'function')
    assert.strictEqual(parsed.needleOpts?.timeout, 1234)
    assert.deepStrictEqual(parsed.needleOpts?.headers, {
      authorization: 'Bearer token'
    })
  })

  test('accepts function logger and internal emitter', () => {
    const emitter = { emit: async () => {} }
    const logger = () => {}

    const parsed = CouchConfig.parse({
      couch: 'http://localhost:5984',
      logger,
      '~emitter': emitter
    })

    assert.strictEqual(typeof parsed.logger, 'function')
    assert.strictEqual(parsed['~emitter'], emitter)
  })

  test('rejects unknown keys', () => {
    assert.throws(
      () => {
        CouchConfig.parse({
          couch: 'http://localhost:5984',
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
})
