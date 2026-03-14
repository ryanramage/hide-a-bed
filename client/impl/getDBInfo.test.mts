import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test, { suite } from 'node:test'
import type { CouchConfigInput } from '../schema/config.mts'
import { getDBInfo } from './getDBInfo.mts'
import { RetryableError } from './utils/errors.mts'
import { TEST_DB_URL } from '../test/setup-db.mts'

suite('getDBInfo', () => {
  test('it should throw if provided config is invalid', async () => {
    await assert.rejects(async () => {
      await getDBInfo({
        // @ts-expect-error testing invalid config
        notAnOption: true,
        // @ts-expect-error testing invalid config
        couch: DB_URL,
        useConsoleLogger: true
      })
    })
  })
  test('integration with pouchdb-server', async t => {
    await t.test('returns database metadata', async () => {
      const config: CouchConfigInput = { couch: TEST_DB_URL }
      const info = await getDBInfo(config)
      assert.strictEqual(info.db_name, 'hide-a-bed-test-db')
      assert.ok(typeof info.doc_count === 'number')
    })
  })

  test('throws RetryableError when server marks response retryable', async t => {
    const port = 8993
    const server = createServer((_req, res) => {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ reason: 'maintenance' }))
    })

    await new Promise<void>(resolve => {
      server.listen(port, resolve)
    })
    t.after(() => {
      server.close()
    })

    await assert.rejects(
      () => getDBInfo({ couch: `http://localhost:${port}/retryable` }),
      (err: unknown) => {
        assert.ok(err instanceof RetryableError)
        assert.strictEqual(err.statusCode, 503)
        assert.strictEqual(err.message, 'maintenance')
        return true
      }
    )
  })

  test('converts network failures into RetryableError', async () => {
    await assert.rejects(
      () => getDBInfo({ couch: 'http://localhost:6555/offline-db' }),
      (err: unknown) => err instanceof RetryableError && err.statusCode === 503
    )
  })
})
