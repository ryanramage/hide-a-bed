import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { WatchOptions } from './watch.mts'

suite('WatchOptions', () => {
  test('allows empty options', () => {
    const parsed = WatchOptions.parse({})

    assert.deepStrictEqual(parsed, {
      include_docs: false
    })
  })

  test('applies default include_docs when provided with retry options', () => {
    const parsed = WatchOptions.parse({
      maxRetries: 5,
      initialDelay: 100,
      maxDelay: 1000
    })

    assert.deepStrictEqual(parsed, {
      include_docs: false,
      maxRetries: 5,
      initialDelay: 100,
      maxDelay: 1000
    })
  })
})
