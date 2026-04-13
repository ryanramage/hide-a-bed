import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test, { suite } from 'node:test'
import { headDB } from './headDB.mts'
import { OperationError, RetryableError } from './utils/errors.mts'
import { TEST_DB_URL } from '../test/setup-db.mts'

type FetchInput = Parameters<typeof globalThis.fetch>[0]
type FetchInit = Parameters<typeof globalThis.fetch>[1]

suite('headDB', () => {
  test('supports URL config input and uses HEAD method', async t => {
    const requestUrls: URL[] = []
    const requestMethods: string[] = []

    const fetchMock = t.mock.method(
      globalThis,
      'fetch',
      async (input: FetchInput, init?: FetchInit) => {
        requestUrls.push(new URL(String(input)))
        requestMethods.push(init?.method ?? 'GET')
        return new Response(null, { status: 200 })
      }
    )

    t.after(() => {
      fetchMock.mock.restore()
    })

    const healthy = await headDB({
      couch: new URL('http://localhost:5984/url-object-db')
    })

    assert.strictEqual(healthy, true)
    const capturedUrl = requestUrls[0]
    if (!capturedUrl) {
      assert.fail('expected request URL to be captured')
    }
    assert.strictEqual(capturedUrl.pathname, '/url-object-db')
    assert.strictEqual(requestMethods[0], 'HEAD')
  })

  test('integration with pouchdb-server', async () => {
    const healthy = await headDB({ couch: TEST_DB_URL })
    assert.strictEqual(healthy, true)
  })

  test('throws RetryableError when server marks response retryable', async t => {
    const port = 8997
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
      () => headDB({ couch: `http://localhost:${port}/retryable` }),
      (err: unknown) => {
        assert.ok(err instanceof RetryableError)
        assert.strictEqual(err.statusCode, 503)
        assert.strictEqual(err.message, 'Database health check failed: maintenance')
        return true
      }
    )
  })

  test('throws OperationError for non-retryable response failures', async t => {
    const port = 8998
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
      () => headDB({ couch: `http://localhost:${port}/forbidden` }),
      (err: unknown) =>
        err instanceof OperationError &&
        err.statusCode === 403 &&
        err.message === 'Database health check failed: no access' &&
        err.couchError === 'forbidden'
    )
  })

  test('converts network failures into RetryableError', async () => {
    await assert.rejects(
      () => headDB({ couch: 'http://localhost:6555/offline-db' }),
      (err: unknown) => err instanceof RetryableError && err.statusCode === 503
    )
  })
})
