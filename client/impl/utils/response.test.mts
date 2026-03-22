import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import {
  getCouchError,
  getSuccessStatusCodes,
  getReason,
  isSuccessStatusCode
} from './response.mts'

suite('response utilities', () => {
  test('extracts reason and couch error from response bodies', () => {
    assert.strictEqual(getReason({ reason: 'missing' }, 'fallback'), 'missing')
    assert.strictEqual(getReason({}, 'fallback'), 'fallback')
    assert.strictEqual(getCouchError({ error: 'conflict' }), 'conflict')
    assert.strictEqual(getCouchError({}), undefined)
  })

  test('exposes endpoint-specific success status codes', () => {
    assert.deepStrictEqual(getSuccessStatusCodes('documentRead'), [200])
    assert.deepStrictEqual(getSuccessStatusCodes('documentWrite'), [200, 201, 202])
    assert.deepStrictEqual(getSuccessStatusCodes('documentDelete'), [200, 202])
    assert.deepStrictEqual(getSuccessStatusCodes('bulkSave'), [201, 202])
  })

  test('applies endpoint-specific success checks', () => {
    assert.strictEqual(isSuccessStatusCode('documentRead', 200), true)
    assert.strictEqual(isSuccessStatusCode('documentRead', 201), false)
    assert.strictEqual(isSuccessStatusCode('documentWrite', 202), true)
    assert.strictEqual(isSuccessStatusCode('documentDelete', 201), false)
    assert.strictEqual(isSuccessStatusCode('bulkSave', 202), true)
    assert.strictEqual(isSuccessStatusCode('viewQuery', 204), false)
  })
})
