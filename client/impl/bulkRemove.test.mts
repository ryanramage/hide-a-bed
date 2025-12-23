import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import needle from 'needle'
import type { CouchConfigInput } from '../schema/config.mts'
import { bulkRemove, bulkRemoveMap } from './bulkRemove.mts'
import { TEST_DB_URL } from '../test/setup-db.mts'

const config: CouchConfigInput = {
  couch: TEST_DB_URL
}

type DocBody = Record<string, unknown>

async function saveDoc(id: string, body: DocBody) {
  const response = await needle(
    'put',
    `${TEST_DB_URL}/${id}`,
    {
      _id: id,
      ...body
    },
    { json: true }
  )

  if (response.statusCode !== 201 && response.statusCode !== 200) {
    throw new Error(`Failed to save document ${id}: ${response.statusCode}`)
  }

  return response.body as { rev: string }
}

async function getDoc(id: string) {
  return needle('get', `${TEST_DB_URL}/${id}`, null, { json: true })
}

suite('bulkRemove', () => {
  test('it should throw if provided config is invalid', async () => {
    await assert.rejects(async () => {
      // @ts-expect-error testing invalid config
      await bulkRemove({ notAnOption: true, couch: DB_URL, useConsoleLogger: true }, ['doc1'])
    })

    await assert.rejects(async () => {
      // @ts-expect-error testing invalid config
      await bulkRemoveMap({ anotherBadOption: 123, couch: DB_URL, useConsoleLogger: true }, [
        'doc1'
      ])
    })
  })

  test('integration with pouchdb-server', async t => {
    await t.test('removes documents via _bulk_docs', async () => {
      await saveDoc('bulk-remove-doc-1', { kind: 'test', count: 1 })

      const results = await bulkRemove(config, ['bulk-remove-doc-1'])
      assert.strictEqual(results.length, 1)
      const [first] = results
      assert.strictEqual(first?.id, 'bulk-remove-doc-1')
      assert.strictEqual(first?.ok, true)
      assert.ok(typeof first?.rev === 'string')

      const { statusCode, body } = await getDoc('bulk-remove-doc-1')
      assert.strictEqual(statusCode, 404)
      assert.strictEqual(body?.error, 'not_found')
    })

    await t.test('returns empty array when docs are missing', async () => {
      const results = await bulkRemove(config, ['bulk-remove-missing'])
      assert.deepStrictEqual(results, [])
    })

    await t.test('bulkRemoveMap removes each document individually', async () => {
      await saveDoc('bulk-remove-map-doc-1', { kind: 'map', count: 1 })

      const results = await bulkRemoveMap(config, ['bulk-remove-map-doc-1'])
      assert.strictEqual(results.length, 1)
      const [first] = results
      assert.ok(first)
      assert.strictEqual(first.id, 'bulk-remove-map-doc-1')
      assert.strictEqual(first.ok, true)
      assert.strictEqual(first.statusCode, 200)

      const { statusCode, body } = await getDoc('bulk-remove-map-doc-1')
      assert.strictEqual(statusCode, 404)
      assert.strictEqual(body?.error, 'not_found')
    })

    await t.test('bulkRemoveMap skips docs without revs', async () => {
      await saveDoc('bulk-remove-map-doc-2', { kind: 'map', count: 2 })

      const results = await bulkRemoveMap(config, [
        'bulk-remove-map-doc-2',
        'bulk-remove-map-missing'
      ])
      assert.strictEqual(results.length, 1)
      const [first] = results
      assert.ok(first)
      assert.strictEqual(first.id, 'bulk-remove-map-doc-2')
      assert.strictEqual(first.ok, true)
    })
  })
})
