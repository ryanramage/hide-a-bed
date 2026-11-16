import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { queryString } from './queryString.mts'
import type { ViewOptions } from '../../schema/couch/couch.input.schema.ts'

const keysToQuote: Array<keyof ViewOptions> = ['endkey', 'key', 'keys', 'startkey']

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
      endkey: '"banana"',
      key: '"banana"',
      startkey: '"banana"'
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

  test('document-ID cursors stay raw while coordinate keys use JSON', () => {
    const params = new URLSearchParams(
      queryString({
        startkey_docid: 'job-"quoted"',
        endkey_docid: 'job-last',
        startkey: [35.78, -78.64]
      })
    )
    assert.equal(params.get('startkey_docid'), 'job-"quoted"')
    assert.equal(params.get('endkey_docid'), 'job-last')
    assert.deepEqual(JSON.parse(params.get('startkey')!), [35.78, -78.64])
  })
})
