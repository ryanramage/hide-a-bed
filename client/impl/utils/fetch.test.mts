import assert from 'node:assert/strict'
import test, { suite, type TestContext } from 'node:test'
import { fetchCouchJson } from './fetch.mts'
import { RetryableError } from './errors.mts'
import type { Dispatcher } from '../../schema/request.mts'

type FetchInput = Parameters<typeof globalThis.fetch>[0]
type FetchInit = Parameters<typeof globalThis.fetch>[1]

const mockFetch = (
  t: TestContext,
  handler: (input: FetchInput, init?: FetchInit) => Promise<Response>
) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', handler)
  t.after(() => {
    fetchMock.mock.restore()
  })
  return fetchMock
}

suite('fetchCouchJson auth', () => {
  test('adds basic auth from explicit config auth', async t => {
    let seenAuth: string | null = null
    mockFetch(t, async (input, init) => {
      seenAuth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? null
      return new Response(
        JSON.stringify({
          auth: seenAuth,
          url: new URL(String(input)).pathname
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    })

    const response = await fetchCouchJson<{
      auth: string
      url: string
    }>({
      auth: {
        username: 'config-user',
        password: 'config-pass'
      },
      method: 'GET',
      url: 'http://localhost:5984/db'
    })

    assert.strictEqual(
      response.body.auth,
      `Basic ${Buffer.from('config-user:config-pass').toString('base64')}`
    )
    assert.strictEqual(response.body.url, '/db')
  })
})

suite('fetchCouchJson request controls', () => {
  test('forwards dispatcher to fetch', async t => {
    const dispatcher = { dispatch: () => true } as unknown as Dispatcher
    let seenDispatcher: unknown
    mockFetch(t, async (_input, init) => {
      seenDispatcher = (init as RequestInit & { dispatcher?: unknown }).dispatcher
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    })

    await fetchCouchJson({
      method: 'GET',
      request: { dispatcher },
      url: 'http://localhost:5984/db'
    })

    assert.strictEqual(seenDispatcher, dispatcher)
  })

  test('forwards request signal to fetch', async t => {
    const controller = new AbortController()
    let seenSignal: AbortSignal | undefined
    mockFetch(t, async (_input, init) => {
      seenSignal = init?.signal as AbortSignal | undefined
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    })

    await fetchCouchJson({
      method: 'GET',
      request: { signal: controller.signal },
      url: 'http://localhost:5984/db'
    })

    assert.strictEqual(seenSignal, controller.signal)
  })

  test('maps timeout aborts to RetryableError', async t => {
    mockFetch(t, async (_input, init) => {
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
    })

    await assert.rejects(
      () =>
        fetchCouchJson({
          method: 'GET',
          request: { timeout: 10 },
          url: 'http://localhost:5984/db'
        }),
      (err: unknown) => err instanceof RetryableError && err.message === 'Request timed out'
    )
  })
})
