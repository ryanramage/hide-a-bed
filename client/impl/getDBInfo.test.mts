import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test, { suite } from 'node:test'
import type { CouchConfigInput } from '../schema/config.mts'
import { getDBInfo } from './getDBInfo.mts'
import { OperationError, RetryableError } from './utils/errors.mts'
import { TEST_DB_URL } from '../test/setup-db.mts'

type FetchInput = Parameters<typeof globalThis.fetch>[0]

suite('getDBInfo', () => {
  test('supports URL config input', async t => {
    const requestUrls: URL[] = []
    const fetchMock = t.mock.method(globalThis, 'fetch', async (input: FetchInput) => {
      requestUrls.push(new URL(String(input)))
      return new Response(JSON.stringify({ db_name: 'url-object-db', doc_count: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    })

    t.after(() => {
      fetchMock.mock.restore()
    })

    const info = await getDBInfo({
      couch: new URL('http://localhost:5984/url-object-db')
    })

    assert.strictEqual(info.db_name, 'url-object-db')
    const capturedUrl = requestUrls[0]
    if (!capturedUrl) {
      assert.fail('expected request URL to be captured')
    }
    assert.strictEqual(capturedUrl.pathname, '/url-object-db')
  })

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
        assert.strictEqual(err.message, 'Failed to fetch database info')
        return true
      }
    )
  })

  test('throws RetryableError for retryable non-JSON response failures', async t => {
    const port = 8995
    const server = createServer((_req, res) => {
      res.statusCode = 503
      res.setHeader('Content-Type', 'text/html')
      res.end('<html>maintenance</html>')
    })

    await new Promise<void>(resolve => {
      server.listen(port, resolve)
    })
    t.after(() => {
      server.close()
    })

    await assert.rejects(
      () => getDBInfo({ couch: `http://localhost:${port}/retryable-text` }),
      (err: unknown) => {
        assert.ok(err instanceof RetryableError)
        assert.strictEqual(err.statusCode, 503)
        assert.strictEqual(err.message, 'Failed to fetch database info')
        return true
      }
    )
  })

  test('throws OperationError for non-retryable response failures', async t => {
    const port = 8994
    const server = createServer((_req, res) => {
      res.statusCode = 403
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'forbidden', reason: 'no access' }))
    })

    await new Promise<void>(resolve => {
      server.listen(port, resolve)
    })
    t.after(() => {
      server.close()
    })

    await assert.rejects(
      () => getDBInfo({ couch: `http://localhost:${port}/forbidden` }),
      (err: unknown) =>
        err instanceof OperationError &&
        err.statusCode === 403 &&
        err.message === 'Failed to fetch database info' &&
        err.couchError === 'forbidden'
    )
  })

  test('throws OperationError for non-JSON response failures', async t => {
    const port = 8996
    const server = createServer((_req, res) => {
      res.statusCode = 401
      res.setHeader('Content-Type', 'text/plain')
      res.end('access denied')
    })

    await new Promise<void>(resolve => {
      server.listen(port, resolve)
    })
    t.after(() => {
      server.close()
    })

    await assert.rejects(
      () => getDBInfo({ couch: `http://localhost:${port}/forbidden-text` }),
      (err: unknown) =>
        err instanceof OperationError &&
        err.statusCode === 401 &&
        err.message === 'Failed to fetch database info' &&
        err.couchError === undefined
    )
  })

  test('converts network failures into RetryableError', async () => {
    await assert.rejects(
      () => getDBInfo({ couch: 'http://localhost:6555/offline-db' }),
      (err: unknown) => err instanceof RetryableError && err.statusCode === 503
    )
  })
})
