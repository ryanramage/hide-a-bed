import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { z } from 'zod'
import type { CouchConfigInput } from '../schema/config.mts'
import { get, getAtRev } from './get.mts'
import { NotFoundError, RetryableError, ValidationError } from './utils/errors.mts'
import { TEST_DB_URL } from '../test/setup-db.mts'
import { putJson } from '../test/http.mts'

const baseConfig: CouchConfigInput = {
  couch: TEST_DB_URL
}

type DocBody = Record<string, unknown>

async function saveDoc(id: string, body: DocBody) {
  const response = await putJson<{ rev: string }>(`${TEST_DB_URL}/${id}`, {
    _id: id,
    ...body
  })

  if (response.statusCode !== 201 && response.statusCode !== 200) {
    throw new Error(`Failed to save document ${id}: ${response.statusCode}`)
  }

  return response.body
}

suite('get', () => {
  test('integration with pouchdb-server', async t => {
    const doc_valid_id = `doc-valid-${Date.now()}`
    const doc_invalid_id = `doc-invalid-${Date.now()}`
    const doc_rev_id = `doc-rev-${Date.now()}`
    await saveDoc(doc_valid_id, { kind: 'example', count: 7 })
    await saveDoc(doc_invalid_id, { kind: 'example', count: 'oops' })
    const firstRev = await saveDoc(doc_rev_id, { version: 1 })
    await saveDoc(doc_rev_id, { _rev: firstRev.rev, version: 2 })

    await t.test('returns documents and validates schema', async () => {
      const schema = z.looseObject({
        _id: z.string(),
        kind: z.literal('example'),
        count: z.number()
      })

      const doc = await get(baseConfig, doc_valid_id, {
        validate: { docSchema: schema }
      })
      assert.ok(doc)
      assert.strictEqual(doc?.kind, 'example')
      assert.strictEqual(doc?.count, 7)

      await assert.rejects(
        () => get(baseConfig, doc_invalid_id, { validate: { docSchema: schema } }),
        (err: unknown) =>
          err instanceof ValidationError &&
          err.message === 'Document validation failed' &&
          err.docId === doc_invalid_id &&
          err.operation === 'get' &&
          err.issues[0]?.message === 'Invalid input: expected number, received string'
      )
    })

    await t.test('returns null when document is missing by default', async () => {
      const missing = await get(baseConfig, 'doc-missing')
      assert.strictEqual(missing, null)
    })

    await t.test('throws NotFoundError when configured', async () => {
      await assert.rejects(
        () =>
          get(
            {
              ...baseConfig,
              throwOnGetNotFound: true
            },
            'doc-missing'
          ),
        (err: unknown) =>
          err instanceof NotFoundError &&
          err.docId === 'doc-missing' &&
          err.statusCode === 404 &&
          err.message === 'Document not found'
      )
    })

    await t.test('getAtRev returns specific revision', async () => {
      const versionedSchema = z.looseObject({
        _id: z.string(),
        version: z.number()
      })

      const latest = await get(baseConfig, doc_rev_id, {
        validate: { docSchema: versionedSchema }
      })
      assert.strictEqual(latest?.version, 2)

      const early = await getAtRev(baseConfig, doc_rev_id, firstRev.rev, {
        validate: { docSchema: versionedSchema }
      })
      assert.strictEqual(early?.version, 1)
    })

    await t.test('propagates retryable network errors', async () => {
      const offlineConfig: CouchConfigInput = {
        couch: 'http://localhost:6553/offline-db'
      }

      await assert.rejects(
        () => get(offlineConfig, 'doc-valid'),
        (err: unknown) => err instanceof RetryableError && err.statusCode === 503
      )
    })
  })
})
