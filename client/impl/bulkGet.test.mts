import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import needle from 'needle'
import type { CouchConfigInput } from '../schema/config.mts'
import { z } from 'zod'
import { RetryableError } from './utils/errors.mts'
import { bulkGet, bulkGetDictionary } from './bulkGet.mts'
import { TEST_DB_URL } from '../test/setup-db.mts'

const config: CouchConfigInput = {
  couch: TEST_DB_URL
}

async function ensureDoc(id: string, body: Record<string, unknown>) {
  await needle(
    'put',
    `${TEST_DB_URL}/${id}`,
    {
      _id: id,
      ...body
    },
    { json: true }
  )
}

suite('bulkGet', () => {
  test('integration with pouchdb-server', async t => {
    await ensureDoc('doc-1', { value: 42 })
    await ensureDoc('doc-valid', { count: 7 })
    await ensureDoc('doc-invalid', { count: 'nope' })

    await t.test('fetches docs and not-found rows', async () => {
      const response = await bulkGet(config, ['doc-1', 'doc-missing'])
      assert.strictEqual(response.rows.length, 2)
      const [first, second] = response.rows
      assert.strictEqual(first?.id, 'doc-1')
      assert.strictEqual(first?.doc?._id, 'doc-1')
      assert.strictEqual(first?.doc?.value, 42)
      assert.strictEqual(second?.error, 'not_found')
      assert.strictEqual(second?.key, 'doc-missing')
    })

    await t.test('supports includeDocs=false via _bulkGetWithOptions', async () => {
      const response = await bulkGet(config, ['doc-1'], {
        includeDocs: false
      })
      assert.strictEqual(response.rows.length, 1)
      const [row] = response.rows
      assert.strictEqual(row?.id, 'doc-1')
      assert.ok(row?.value?.rev)
      assert.ok(!('doc' in (row as Record<string, unknown>)))
    })

    await t.test('validates documents when schema provided', async () => {
      const schema = z.looseObject({
        _id: z.string(),
        _rev: z.string().optional(),
        count: z.number()
      })

      const valid = await bulkGet(config, ['doc-valid'], {
        validate: {
          docSchema: schema
        }
      })
      assert.strictEqual(valid.rows[0]?.doc?.count, 7)

      await assert.rejects(
        () =>
          bulkGet(config, ['doc-invalid'], {
            validate: {
              docSchema: schema
            }
          }),
        (err: unknown) => {
          assert.ok(Array.isArray(err))
          assert.match(err[0]?.message, /Invalid input:/)
          return true
        }
      )
    })

    await t.test('skips invalid documents when onInvalidDoc=skip', async () => {
      const schema = z.looseObject({
        _id: z.string(),
        _rev: z.string().optional(),
        count: z.number()
      })

      const response = await bulkGet(config, ['doc-valid', 'doc-invalid'], {
        validate: {
          docSchema: schema,
          onInvalidDoc: 'skip'
        }
      })

      assert.strictEqual(response.rows.length, 1)
      assert.strictEqual(response.rows[0]?.doc?._id, 'doc-valid')
      assert.strictEqual(response.rows[0]?.doc?.count, 7)
    })

    await t.test('throws RetryableError for retryable status codes', async () => {
      const offlineConfig: CouchConfigInput = {
        couch: 'http://localhost:6553/offline-db'
      }

      await assert.rejects(
        () => bulkGet(offlineConfig, ['doc-1']),
        (err: unknown) => err instanceof RetryableError && err.statusCode === 503
      )
    })

    await t.test('bulkGetDictionary groups results', async () => {
      const result = await bulkGetDictionary(config, ['doc-valid', 'doc-missing'])
      assert.deepStrictEqual(Object.keys(result.found), ['doc-valid'])
      assert.strictEqual(result.found['doc-valid'].count, 7)
      assert.deepStrictEqual(Object.keys(result.notFound), ['doc-missing'])
      assert.strictEqual(result.notFound['doc-missing'].error, 'not_found')
    })

    await t.test('bulkGetDictionary with validation schema', async () => {
      const schema = z.looseObject({
        _id: z.string(),
        _rev: z.string().optional(),
        count: z.number()
      })

      const result = await bulkGetDictionary(config, ['doc-valid', 'doc-not-there'], {
        validate: {
          docSchema: schema
        }
      })

      assert.deepStrictEqual(Object.keys(result.found), ['doc-valid'])
      assert.strictEqual(result.found['doc-valid'].count, 7)
      assert.deepStrictEqual(Object.keys(result.notFound), ['doc-not-there'])
      assert.strictEqual(result.notFound['doc-not-there'].error, 'not_found')
    })

    await t.test('bulkGetDictionary skips invalid docs when requested', async () => {
      const schema = z.looseObject({
        _id: z.string(),
        _rev: z.string().optional(),
        count: z.number()
      })

      const result = await bulkGetDictionary(config, ['doc-valid', 'doc-invalid'], {
        validate: {
          docSchema: schema,
          onInvalidDoc: 'skip'
        }
      })

      assert.deepStrictEqual(Object.keys(result.found), ['doc-valid'])
      assert.strictEqual(result.found['doc-valid'].count, 7)
      assert.deepStrictEqual(Object.keys(result.notFound), [])
    })
  })
})
