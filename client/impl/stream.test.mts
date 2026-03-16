import assert from 'node:assert/strict'
import test, { suite, type TestContext } from 'node:test'
import { queryStream } from './stream.mts'
import { bindConfig } from './bindConfig.mts'

type FetchInput = Parameters<typeof globalThis.fetch>[0]
type FetchInit = Parameters<typeof globalThis.fetch>[1]

const encoder = new TextEncoder()

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
    push(chunk: string) {
      controller?.enqueue(encoder.encode(chunk))
    }
  }
}

const pushJsonInChunks = (
  response: ReturnType<typeof createStreamResponse>,
  body: unknown,
  chunkSize = 7
) => {
  const payload = JSON.stringify(body)
  queueMicrotask(() => {
    for (let i = 0; i < payload.length; i += chunkSize) {
      response.push(payload.slice(i, i + chunkSize))
    }
    response.close()
  })
}

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

suite('queryStream', () => {
  test('queryStream streams rows from chunked response', async t => {
    const expectedRows = [
      { id: 'row-1', key: 'row-1', value: { count: 1 } },
      { id: 'row-2', key: 'row-2', value: { count: 2 } }
    ]
    const rows: unknown[] = []
    const streamedResponse = createStreamResponse()
    mockFetch(t, async (input, init) => {
      const requestUrl = new URL(String(input))
      assert.strictEqual(init?.method, 'GET')
      assert.strictEqual(requestUrl.pathname, '/db/_design/demo/_view/by-key')
      pushJsonInChunks(streamedResponse, {
        total_rows: expectedRows.length,
        rows: expectedRows
      })
      return streamedResponse.response
    })

    await queryStream(
      { couch: 'http://localhost:5984/db' },
      '_design/demo/_view/by-key',
      {},
      row => {
        const matchedRow = expectedRows.find(r => r.id === row.id)
        assert.ok(matchedRow)
        assert.deepStrictEqual(row, matchedRow)
        rows.push(row)
      }
    )

    assert.deepStrictEqual(rows, expectedRows)
  })

  test('queryStream works with bindConfig', async t => {
    const expectedRows = [
      { id: 'row-1', key: 'row-1', value: { count: 1 } },
      { id: 'row-2', key: 'row-2', value: { count: 2 } }
    ]
    const rows: unknown[] = []
    const streamedResponse = createStreamResponse()
    mockFetch(t, async (input, init) => {
      const requestUrl = new URL(String(input))
      assert.strictEqual(init?.method, 'GET')
      assert.strictEqual(requestUrl.pathname, '/db/_design/demo/_view/by-key')
      pushJsonInChunks(streamedResponse, {
        total_rows: expectedRows.length,
        rows: expectedRows
      })
      return streamedResponse.response
    })

    const db = bindConfig({ couch: 'http://localhost:5984/db' })

    await db.queryStream('_design/demo/_view/by-key', {}, row => {
      const matchedRow = expectedRows.find(r => r.id === row.id)
      assert.ok(matchedRow)
      assert.deepStrictEqual(row, matchedRow)
      rows.push(row)
    })

    assert.deepStrictEqual(rows, expectedRows)
  })

  test('queryStream works with options chaining', async t => {
    const expectedRows = [
      { id: 'row-1', key: 'row-1', value: { count: 1 } },
      { id: 'row-2', key: 'row-2', value: { count: 2 } }
    ]
    const rows: unknown[] = []
    const streamedResponse = createStreamResponse()
    mockFetch(t, async (input, init) => {
      const requestUrl = new URL(String(input))
      assert.strictEqual(init?.method, 'GET')
      assert.strictEqual(requestUrl.pathname, '/db/_design/demo/_view/by-key')
      pushJsonInChunks(streamedResponse, {
        total_rows: expectedRows.length,
        rows: expectedRows
      })
      return streamedResponse.response
    })

    const db = bindConfig({ couch: 'http://localhost:5984/db' })

    await db.options({ logger: console }).queryStream('_design/demo/_view/by-key', {}, row => {
      const matchedRow = expectedRows.find(r => r.id === row.id)
      assert.ok(matchedRow)
      assert.deepStrictEqual(row, matchedRow)
      rows.push(row)
    })

    assert.deepStrictEqual(rows, expectedRows)
  })

  test('queryStream handles empty result sets', async t => {
    let rowCount = 0
    const streamedResponse = createStreamResponse()
    mockFetch(t, async () => {
      pushJsonInChunks(streamedResponse, { rows: [] })
      return streamedResponse.response
    })

    await queryStream(
      { couch: 'http://localhost:5984/db' },
      '_design/demo/_view/by-key',
      {},
      () => {
        rowCount++
      }
    )

    assert.strictEqual(rowCount, 0)
  })

  test('queryStream rejects when row handler throws', async t => {
    const handlerError = new Error('row-failure')
    const streamedResponse = createStreamResponse()
    mockFetch(t, async () => {
      pushJsonInChunks(streamedResponse, { rows: [{ id: 'broken', value: 42 }] })
      return streamedResponse.response
    })

    await assert.rejects(
      queryStream({ couch: 'http://localhost:5984/db' }, '_design/demo/_view/error', {}, () => {
        throw handlerError
      }),
      error => {
        assert.strictEqual(error, handlerError)
        return true
      }
    )
  })

  test('queryStream aborts when config request signal is aborted', async t => {
    const controller = new AbortController()
    const activeResponse = createStreamResponse()
    const requests: Array<{ signal: AbortSignal | null; url: string }> = []
    mockFetch(t, async (input, init) => {
      requests.push({
        signal: init?.signal ?? null,
        url: String(input)
      })
      return activeResponse.response
    })

    const streamPromise = queryStream(
      {
        couch: 'http://localhost:5984/query-stream-abort',
        request: { signal: controller.signal }
      },
      '_design/demo/_view/by-key',
      {},
      () => {}
    )

    await waitFor(() => requests.length === 1)
    controller.abort()

    await assert.rejects(
      streamPromise,
      (err: unknown) => err instanceof DOMException && err.name === 'AbortError'
    )

    assert.strictEqual(requests[0].signal?.aborted, true)
  })
})
