import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import type { CouchConfigInput } from '../schema/config.mts'
import { remove } from './remove.mts'
import { NotFoundError, RetryableError } from './utils/errors.mts'
import { TEST_DB_URL } from '../test/setup-db.mts'
import { getJson, putJson } from '../test/http.mts'

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

async function getDoc(id: string) {
  return getJson(`${TEST_DB_URL}/${id}`)
}

suite('remove', () => {
  test('it should throw if provided config is invalid', async () => {
    await assert.rejects(async () => {
      await remove(
        // @ts-expect-error testing invalid config
        { couch: DB_URL, useConsoleLogger: true, unexpected: true },
        'doc-invalid-config',
        '1-invalid'
      )
    })
  })

  test('integration with pouchdb-server', async t => {
    await t.test('removes an existing document', async () => {
      const remove_doc_id = `remove-doc-1-${Date.now()}`
      const { rev } = await saveDoc(remove_doc_id, { kind: 'test', count: 1 })

      const result = await remove(baseConfig, remove_doc_id, rev)
      assert.strictEqual(result.ok, true)
      assert.strictEqual(result.id, remove_doc_id)
      assert.strictEqual(result.statusCode, 200)

      const { statusCode, body } = await getDoc(remove_doc_id)
      assert.strictEqual(statusCode, 404)
      assert.strictEqual(body?.error, 'not_found')
    })

    await t.test('throws NotFoundError when document is missing', async () => {
      await assert.rejects(
        () => remove(baseConfig, 'remove-doc-missing', '1-missing'),
        (err: unknown) =>
          err instanceof NotFoundError &&
          err.docId === 'remove-doc-missing' &&
          err.statusCode === 404 &&
          err.message === 'Document not found'
      )
    })

    await t.test('propagates retryable network errors', async () => {
      const offlineConfig: CouchConfigInput = {
        couch: 'http://localhost:6553/offline-remove-db'
      }

      await assert.rejects(
        () => remove(offlineConfig, 'remove-doc-network', '1-offline'),
        (err: unknown) => err instanceof RetryableError && err.statusCode === 503
      )
    })
  })
})
