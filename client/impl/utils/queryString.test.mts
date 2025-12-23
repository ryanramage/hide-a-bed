import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { queryString } from './queryString.mts'
import type { ViewOptions } from '../../schema/couch/couch.input.schema.ts'

const keysToQuote: Array<keyof ViewOptions> = [
  'endkey_docid',
  'endkey',
  'key',
  'keys',
  'startkey',
  'startkey_docid',
  'update'
]

suite('queryString', () => {
  test('queryString quotes string values for KEYS_TO_QUOTE except keys array', () => {
    const encodedByKey = new Map<string, string | null>()

    for (const key of keysToQuote) {
      if (key === 'keys') continue
      const optionValue: ViewOptions = {
        [key]: key === 'update' ? 'lazy' : 'banana'
      } as ViewOptions
      const encoded = queryString(optionValue)
      const params = new URLSearchParams(encoded)
      encodedByKey.set(key as string, params.get(key as string))
    }

    assert.deepEqual(Object.fromEntries(encodedByKey), {
      endkey_docid: '"banana"',
      endkey: '"banana"',
      key: '"banana"',
      startkey: '"banana"',
      startkey_docid: '"banana"',
      update: '"lazy"'
    })
  })

  test('queryString leaves primitive options outside KEYS_TO_QUOTE unchanged', () => {
    const encoded = queryString({ descending: true })
    const params = new URLSearchParams(encoded)
    assert.equal(params.get('descending'), 'true')
  })

  test('queryString stringifies array values for keys option', () => {
    const encoded = queryString({
      keys: ['alpha', null, 42, {}, { foo: 'bar' }]
    })
    const params = new URLSearchParams(encoded)
    assert.equal(params.get('keys'), '["alpha",null,42,{}, {"foo":"bar"}]'.replace(' ', ''))
  })
})
