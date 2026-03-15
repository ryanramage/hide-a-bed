import assert from 'node:assert/strict'
import test, { suite, type TestContext } from 'node:test'
import type { CouchConfigInput } from '../../schema/config.mts'
import { watchDocs } from './watch.mts'

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
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', handler)
  t.after(() => {
    fetchMock.mock.restore()
  })
  return fetchMock
}

suite('watchDocs', () => {
  test('requires at least one document id', () => {
    assert.throws(() => {
      watchDocs(baseConfig(), [], () => {})
    }, /non-empty array/)
  })

  test('rejects more than 100 document ids', () => {
    const ids = Array.from({ length: 101 }, (_, index) => `doc-${index}`)
    assert.throws(() => {
      watchDocs(baseConfig(), ids, () => {})
    }, /100 or fewer elements/)
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    assert.match(requests[0].url, /include_docs=true/)
    assert.match(requests[0].url, /doc_ids=\["doc-a","doc-b"\]/)

    watcher.stop()
    assert.strictEqual(requests[0].signal?.aborted, true)
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
      errors.push(err as unknown as Error)
    })

    await waitFor(() => requests.length === 3)
    await waitFor(() => errors.length === 1)
    assert.strictEqual(errors[0].message, 'Max retries reached')

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

    const watcher = watchDocs(baseConfig(), 'doc-stop', () => {})

    await waitFor(() => requests.length === 1)
    watcher.stop()

    assert.strictEqual(requests[0].signal?.aborted, true)
  })
})
