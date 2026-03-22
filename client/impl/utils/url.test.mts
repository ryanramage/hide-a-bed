import assert from 'node:assert/strict'
import test, { suite } from 'node:test'

import { createCouchDbUrl, createCouchDocUrl, createCouchPathUrl } from './url.mts'

suite('url helpers', () => {
  test('createCouchDbUrl preserves database path for URL objects', () => {
    const base = new URL('http://localhost:5984/db-name')
    const url = createCouchDbUrl(base)

    assert.notStrictEqual(url, base)
    assert.strictEqual(url.href, 'http://localhost:5984/db-name')
  })

  test('createCouchDocUrl encodes document ids as a single path segment', () => {
    const url = createCouchDocUrl('folder/doc name', 'http://localhost:5984/db-name')

    assert.strictEqual(url.pathname, '/db-name/folder%2Fdoc%20name')
  })

  test('createCouchPathUrl appends structured path segments for view endpoints', () => {
    const url = createCouchPathUrl(
      '_design/demo docs/_view/by key',
      new URL('http://localhost:5984/db-name')
    )

    assert.strictEqual(url.pathname, '/db-name/_design/demo%20docs/_view/by%20key')
  })
})
