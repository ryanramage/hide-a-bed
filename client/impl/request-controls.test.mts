import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { get } from './get.mts'
import { put } from './put.mts'
import { query } from './query.mts'
import { bindConfig } from './bindConfig.mts'
import type { Dispatcher } from '../schema/request.mts'

type FetchInput = Parameters<typeof globalThis.fetch>[0]
type FetchInit = Parameters<typeof globalThis.fetch>[1]

suite('request controls', () => {
  test('put uses request controls from config', async t => {
    const configDispatcher = { dispatch: () => true } as unknown as Dispatcher
    let seenDispatcher: unknown

    const fetchMock = t.mock.method(
      globalThis,
      'fetch',
      async (_input: FetchInput, init?: FetchInit) => {
        seenDispatcher = (init as RequestInit & { dispatcher?: unknown }).dispatcher
        return new Response(JSON.stringify({ ok: true, id: 'put-doc', rev: '1-a' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    )

    t.after(() => {
      fetchMock.mock.restore()
    })

    const result = await put(
      {
        couch: 'http://localhost:5984/request-put',
        request: { dispatcher: configDispatcher }
      },
      { _id: 'put-doc' }
    )

    assert.strictEqual(result.ok, true)
    assert.strictEqual(seenDispatcher, configDispatcher)
  })

  test('get uses request controls from config alongside domain options', async t => {
    const configDispatcher = { dispatch: () => true } as unknown as Dispatcher
    let seenDispatcher: unknown

    const fetchMock = t.mock.method(
      globalThis,
      'fetch',
      async (_input: FetchInput, init?: FetchInit) => {
        seenDispatcher = (init as RequestInit & { dispatcher?: unknown }).dispatcher
        return new Response(JSON.stringify({ _id: 'get-doc' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    )

    t.after(() => {
      fetchMock.mock.restore()
    })

    const result = await get(
      {
        couch: 'http://localhost:5984/request-get',
        request: { dispatcher: configDispatcher }
      },
      'get-doc',
      {
        validate: {}
      }
    )

    assert.strictEqual(result?._id, 'get-doc')
    assert.strictEqual(seenDispatcher, configDispatcher)
  })

  test('get rejects per-call request controls in options', async () => {
    await assert.rejects(
      () =>
        get({ couch: 'http://localhost:5984/request-get-invalid' }, 'get-doc', {
          request: { timeout: 10 }
        } as Parameters<typeof get>[2]),
      /request/
    )
  })

  test('query rejects per-call request controls in options', async () => {
    await assert.rejects(
      () =>
        query(
          { couch: 'http://localhost:5984/request-query-invalid' },
          '_design/demo/_view/by-key',
          {
            request: { timeout: 10 }
          } as Parameters<typeof query>[2]
        ),
      /request/
    )
  })

  test('timeout is applied per retry attempt', async t => {
    let attempt = 0

    const fetchMock = t.mock.method(
      globalThis,
      'fetch',
      async (_input: FetchInput, init?: FetchInit) => {
        attempt++

        if (attempt === 1) {
          const signal = init?.signal
          return await new Promise<Response>((_resolve, reject) => {
            if (!signal) {
              reject(new Error('expected signal'))
              return
            }

            signal.addEventListener(
              'abort',
              () => {
                reject(signal.reason)
              },
              { once: true }
            )
          })
        }

        assert.strictEqual(init?.signal?.aborted, false)
        return new Response(JSON.stringify({ db_name: 'retry-db' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    )

    t.after(() => {
      fetchMock.mock.restore()
    })

    const db = bindConfig({
      backoffFactor: 1,
      couch: 'http://localhost:5984/retry-db',
      initialDelay: 1,
      maxRetries: 1,
      request: {
        timeout: 10
      }
    })

    const info = await db.getDBInfo()

    assert.strictEqual(info.db_name, 'retry-db')
    assert.strictEqual(attempt, 2)
  })

  test('bindConfig retries a transient auth response once by default', async t => {
    let attempt = 0

    const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
      attempt++

      if (attempt === 1) {
        return new Response(JSON.stringify({ error: 'unauthorized', reason: 'socket hiccup' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ db_name: 'retry-db' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    })

    t.after(() => {
      fetchMock.mock.restore()
    })

    const db = bindConfig({
      backoffFactor: 1,
      couch: 'http://localhost:5984/retry-db',
      initialDelay: 0,
      maxRetries: 5
    })

    const info = await db.getDBInfo()

    assert.strictEqual(info.db_name, 'retry-db')
    assert.strictEqual(attempt, 2)
  })
})
