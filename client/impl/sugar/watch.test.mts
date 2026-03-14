import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { EventEmitter } from 'node:events'
import needle from 'needle'
import type { CouchConfigInput } from '../../schema/config.mts'
import { watchDocs } from './watch.mts'

class FakeRequest extends EventEmitter {
  destroyed = false

  destroy() {
    this.destroyed = true
    this.emit('close')
  }
}

type NeedleRequest = ReturnType<typeof needle.get>

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
    const requests: FakeRequest[] = []
    const getMock = t.mock.method(needle, 'get', () => {
      const request = new FakeRequest()
      requests.push(request)
      return request as unknown as NeedleRequest
    })
    t.after(() => {
      getMock.mock.restore()
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
    const firstRequest = requests[0]

    firstRequest.emit('data', Buffer.from('{"id":"doc-a","seq":"1"}\n{"id":"doc-b","seq":"2"}\n'))

    await waitFor(() => changes.length === 2)

    assert.deepStrictEqual(
      changes.map(change => change.id),
      ['doc-a', 'doc-b']
    )
    const firstArg = getMock.mock.calls[0].arguments[0]
    if (typeof firstArg !== 'string') {
      throw new Error('Expected first argument to be a string')
    }
    assert.match(firstArg, /include_docs=true/)
    assert.match(firstArg, /doc_ids=\["doc-a","doc-b"\]/)

    watcher.stop()
  })

  test('reconnects after retryable response status', async t => {
    const requests: FakeRequest[] = []
    const getMock = t.mock.method(needle, 'get', () => {
      const request = new FakeRequest()
      requests.push(request)
      return request as unknown as NeedleRequest
    })
    t.after(() => {
      getMock.mock.restore()
    })

    const watcher = watchDocs(baseConfig(), 'doc-retry', () => {}, {
      initialDelay: 1,
      maxDelay: 1,
      maxRetries: 3
    })

    await waitFor(() => requests.length === 1)
    const firstRequest = requests[0]
    firstRequest.emit('response', { statusCode: 503 })

    await waitFor(() => requests.length === 2)

    assert.ok(firstRequest.destroyed)
    assert.strictEqual(getMock.mock.callCount(), 2)

    watcher.stop()
  })

  test('emits error after exhausting retries', async t => {
    const requests: FakeRequest[] = []
    const getMock = t.mock.method(needle, 'get', () => {
      const request = new FakeRequest()
      requests.push(request)
      return request as unknown as NeedleRequest
    })
    t.after(() => {
      getMock.mock.restore()
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

    await waitFor(() => requests.length === 1)
    requests[0].emit('error', { code: 'ECONNRESET' })

    await waitFor(() => requests.length === 2)
    requests[1].emit('error', { code: 'ECONNRESET' })

    await waitFor(() => requests.length === 3)
    requests[2].emit('error', { code: 'ECONNRESET' })

    await waitFor(() => errors.length === 1)
    assert.strictEqual(errors[0].message, 'Max retries reached')

    watcher.stop()
  })
})
