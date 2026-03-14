import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { TrackedEmitter, setupEmitter } from './trackedEmitter.mts'

suite('TrackedEmitter', () => {
  test('emits to all listeners with provided arguments', async () => {
    const emitter = new TrackedEmitter({})
    const calls: Array<[string, number]> = []

    emitter.on('saved', (id: string, version: number) => {
      calls.push([id, version])
    })
    emitter.on('saved', (id: string, version: number) => {
      calls.push([`${id}-again`, version + 1])
    })

    const result = await emitter.emit('saved', 'doc-1', 2)

    assert.strictEqual(result, undefined)
    assert.deepStrictEqual(calls, [
      ['doc-1', 2],
      ['doc-1-again', 3]
    ])
  })

  test('waits for the configured delay before resolving', async () => {
    const emitter = new TrackedEmitter({ delay: 20 })
    emitter.on('delayed', () => {})

    const startedAt = Date.now()
    await emitter.emit('delayed')
    const elapsed = Date.now() - startedAt

    assert.ok(elapsed >= 15, `expected emit to wait for delay, got ${elapsed}ms`)
  })
})

suite('setupEmitter', () => {
  test('returns a no-op emitter when none is configured', async () => {
    const emitter = setupEmitter({ couch: 'http://localhost:5984' })

    await assert.doesNotReject(async () => emitter.emit('ignored', { value: 1 }))
  })

  test('returns the configured emitter instance', () => {
    const tracked = new TrackedEmitter({})
    const emitter = setupEmitter({
      couch: 'http://localhost:5984',
      '~emitter': tracked
    })

    assert.strictEqual(emitter, tracked)
  })
})
