import assert from 'node:assert/strict'
import test, { suite, type TestContext } from 'node:test'
import type { CouchConfigInput } from '../../schema/config.mts'
import { watchDocs } from './watch.mts'
import { OperationError } from '../utils/errors.mts'

type FetchInput = Parameters<typeof globalThis.fetch>[0]
type FetchInit = Parameters<typeof globalThis.fetch>[1]

const encoder = new TextEncoder()

type FetchRequest = {
  signal: AbortSignal | null
  url: string
}

const baseConfig = (): CouchConfigInput => ({
  couch: 'http://localhost:5984/watch-test'
})

const waitFor = async (predicate: () => boolean, timeoutMs = 2000, intervalMs = 10) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    if (predicate()) return
    await new Promise(resolve => {
      setTimeout(resolve, intervalMs)
    })
  }
  throw new Error('waitFor timed out')
}

const createStreamResponse = (status = 200) => {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(innerController) {
      controller = innerController
    }
  })

  return {
    response: new Response(stream, { status }),
    close() {
      controller?.close()
    },
    error(err: Error) {
      controller?.error(err)
    },
    push(chunk: string) {
      controller?.enqueue(encoder.encode(chunk))
    }
  }
}

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

suite('watchDocs', () => {
  test('requires at least one document id', () => {
    assert.throws(
      () => {
        watchDocs(baseConfig(), [], () => {})
      },
      (err: unknown) => {
        assert.ok(err instanceof OperationError)
        assert.strictEqual(err.message, 'docIds must be a non-empty array')
        assert.strictEqual(err.operation, 'watchDocs')
        return true
      }
    )
  })

  test('rejects more than 100 document ids', () => {
    const ids = Array.from({ length: 101 }, (_, index) => `doc-${index}`)
    assert.throws(
      () => {
        watchDocs(baseConfig(), ids, () => {})
      },
      (err: unknown) => {
        assert.ok(err instanceof OperationError)
        assert.strictEqual(err.message, 'docIds must be an array of 100 or fewer elements')
        assert.strictEqual(err.operation, 'watchDocs')
        return true
      }
    )
  })

  test('emits change events for streamed chunks', async t => {
    const requests: FetchRequest[] = []
    const firstResponse = createStreamResponse()
    mockFetch(t, async (input, init) => {
      requests.push({
        signal: init?.signal ?? null,
        url: String(input)
      })
      return firstResponse.response
    })

    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const changes: any[] = []
    const watcher = watchDocs(
      baseConfig(),
      ['doc-a', 'doc-b'],
      change => {
        changes.push(change)
      },
      { include_docs: true }
    )

    await waitFor(() => requests.length === 1)

    firstResponse.push('{"id":"doc-a","seq":"1"}\n{"id":"doc-b","seq":"2"}\n')
    await waitFor(() => changes.length === 2)

    assert.deepStrictEqual(
      changes.map(change => change.id),
      ['doc-a', 'doc-b']
    )
    const requestUrl = new URL(requests[0].url)
    assert.strictEqual(requestUrl.searchParams.get('include_docs'), 'true')
    assert.strictEqual(requestUrl.searchParams.get('doc_ids'), '["doc-a","doc-b"]')

    watcher.stop()
    assert.strictEqual(requests[0].signal?.aborted, true)
  })

  test('supports URL config input', async t => {
    const requests: FetchRequest[] = []
    const activeResponse = createStreamResponse()
    mockFetch(t, async (input, init) => {
      requests.push({
        signal: init?.signal ?? null,
        url: String(input)
      })
      return activeResponse.response
    })

    const watcher = watchDocs(
      {
        couch: new URL('http://localhost:5984/watch-url-db')
      },
      'folder/doc name',
      () => {}
    )

    await waitFor(() => requests.length === 1)

    const requestUrl = new URL(requests[0].url)
    assert.strictEqual(requestUrl.pathname, '/watch-url-db/_changes')
    assert.strictEqual(requestUrl.searchParams.get('doc_ids'), '["folder/doc name"]')

    watcher.stop()
  })

  test('reconnects after retryable response status', async t => {
    const requests: FetchRequest[] = []
    const retryResponse = createStreamResponse(503)
    const activeResponse = createStreamResponse()
    const responses = [retryResponse.response, activeResponse.response]

    const fetchMock = mockFetch(t, async (input, init) => {
      requests.push({
        signal: init?.signal ?? null,
        url: String(input)
      })
      const response = responses.shift()
      if (!response) {
        throw new Error('No more responses configured')
      }
      return response
    })
    const watcher = watchDocs(baseConfig(), 'doc-retry', () => {}, {
      initialDelay: 1,
      maxDelay: 1,
      maxRetries: 3
    })

    await waitFor(() => requests.length === 2)

    assert.strictEqual(requests[0].signal?.aborted, true)
    assert.strictEqual(fetchMock.mock.callCount(), 2)

    watcher.stop()
  })

  test('emits error after exhausting retries', async t => {
    const requests: FetchRequest[] = []
    const failure = Object.assign(new Error('fetch failed'), {
      cause: { code: 'ECONNRESET' }
    })
    mockFetch(t, async (input, init) => {
      requests.push({
        signal: init?.signal ?? null,
        url: String(input)
      })
      throw failure
    })

    const errors: Error[] = []
    const watcher = watchDocs(baseConfig(), 'doc-max', () => {}, {
      maxRetries: 2,
      initialDelay: 1,
      maxDelay: 1
    })
    watcher.on('error', err => {
      errors.push(err as Error)
    })

    await waitFor(() => requests.length === 3)
    await waitFor(() => errors.length === 1)
    assert.strictEqual(errors[0].message, 'Watch retries exhausted')

    watcher.stop()
  })

  test('stop aborts an active fetch stream', async t => {
    const requests: FetchRequest[] = []
    const activeResponse = createStreamResponse()
    mockFetch(t, async (input, init) => {
      requests.push({
        signal: init?.signal ?? null,
        url: String(input)
      })
      return activeResponse.response
    })

    const watcher = watchDocs(
      {
        ...baseConfig(),
        request: {
          timeout: 1000
        }
      },
      'doc-stop',
      () => {}
    )

    await waitFor(() => requests.length === 1)
    watcher.stop()

    assert.strictEqual(requests[0].signal?.aborted, true)
  })

  test('config request signal stops the watcher lifecycle', async t => {
    const controller = new AbortController()
    const requests: FetchRequest[] = []
    const activeResponse = createStreamResponse()
    mockFetch(t, async (input, init) => {
      requests.push({
        signal: init?.signal ?? null,
        url: String(input)
      })
      return activeResponse.response
    })

    const endEvents: Array<{ lastSeq: null | 'now' }> = []
    const watcher = watchDocs(
      {
        ...baseConfig(),
        request: {
          signal: controller.signal
        }
      },
      'doc-external-stop',
      () => {},
      {
        initialDelay: 1,
        maxDelay: 1,
        maxRetries: 3
      }
    )

    watcher.on('end', (payload: unknown) => {
      endEvents.push(payload as unknown as { lastSeq: null | 'now' })
    })

    await waitFor(() => requests.length === 1)
    controller.abort()

    await waitFor(() => endEvents.length === 1)
    await new Promise(resolve => {
      setTimeout(resolve, 25)
    })

    assert.strictEqual(requests[0].signal?.aborted, true)
    assert.strictEqual(requests.length, 1)
  })

  test('rejects per-call request controls in watch options', () => {
    assert.throws(() => {
      watchDocs(baseConfig(), 'doc-invalid', () => {}, {
        request: { timeout: 10 }
      } as Parameters<typeof watchDocs>[3])
    }, /request/)
  })
})
