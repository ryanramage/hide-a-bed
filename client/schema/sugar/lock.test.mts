import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { LockDoc, LockOptions } from './lock.mts'

suite('LockOptions', () => {
  test('defaults enableLocking to true', () => {
    const parsed = LockOptions.parse({
      username: 'alice'
    })

    assert.deepStrictEqual(parsed, {
      enableLocking: true,
      username: 'alice'
    })
  })
})

suite('LockDoc', () => {
  test('parses lock documents', () => {
    const parsed = LockDoc.parse({
      _id: 'lock-doc-1',
      _rev: '1-a',
      type: 'lock',
      locks: 'doc-1',
      lockedAt: new Date().toISOString(),
      lockedBy: 'alice'
    })

    assert.strictEqual(parsed.type, 'lock')
    assert.strictEqual(parsed.locks, 'doc-1')
    assert.strictEqual(parsed.lockedBy, 'alice')
  })

  test('rejects non-lock documents', () => {
    assert.throws(
      () =>
        LockDoc.parse({
          _id: 'lock-doc-1',
          type: 'document',
          locks: 'doc-1',
          lockedAt: new Date().toISOString(),
          lockedBy: 'alice'
        }),
      /Invalid input/
    )
  })
})
