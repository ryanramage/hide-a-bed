import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import needle from 'needle'
import type { CouchConfigInput } from '../schema/config.mts'
import { put } from './put.mts'
import { RetryableError } from './utils/errors.mts'
import { TEST_DB_URL } from '../test/setup-db.mts'

const baseConfig: CouchConfigInput = {
  couch: TEST_DB_URL
}

type DocBody = Record<string, unknown>

async function getDoc(id: string) {
  return needle('get', `${TEST_DB_URL}/${id}`, null, { json: true })
}

async function saveDoc(id: string, body: DocBody) {
  const response = await needle('put', `${TEST_DB_URL}/${id}`, { _id: id, ...body }, { json: true })
  if (response.statusCode !== 201 && response.statusCode !== 200) {
    throw new Error(`Failed to save document ${id}: ${response.statusCode}`)
  }

  return response.body as { rev: string }
}

suite('put', () => {
  test('rejects invalid config arguments', async () => {
    await assert.rejects(async () => {
      // @ts-expect-error testing invalid config
      await put({ couch: DB_URL, unsupported: true }, { _id: 'bad-config-doc' })
    })
  })

  test('propagates retryable network failures', async () => {
    const offlineConfig: CouchConfigInput = {
      couch: 'http://localhost:6555/offline-put-test'
    }

    await assert.rejects(
      () => put(offlineConfig, { _id: 'offline-doc', kind: 'offline' }),
      (err: unknown) => err instanceof RetryableError && err.statusCode === 503
    )
  })

  test('integration with pouchdb-server', async t => {
    let initialRev: string | undefined
    const put_doc_id = `put-doc-${Date.now()}`

    await t.test('creates documents via PUT', async () => {
      const result = await put(baseConfig, {
        _id: put_doc_id,
        type: 'integration',
        count: 1
      })
      assert.ok(result)
      assert.strictEqual(result.ok, true)
      assert.strictEqual(result.id, put_doc_id)
      assert.strictEqual(result.statusCode, 201)
      assert.ok(typeof result.rev === 'string')
      initialRev = result.rev

      const { statusCode, body } = await getDoc(put_doc_id)
      assert.strictEqual(statusCode, 200)
      assert.strictEqual(body?.type, 'integration')
      assert.strictEqual(body?.count, 1)
    })

    await t.test('updates documents when revision supplied', async () => {
      if (!initialRev) throw new Error('Expected initial revision to be captured')

      const updateResult = await put(baseConfig, {
        _id: put_doc_id,
        _rev: initialRev,
        type: 'integration',
        count: 2
      })
      assert.ok(updateResult)
      assert.strictEqual(updateResult.ok, true)
      assert.strictEqual(updateResult.statusCode, 201)
      assert.ok(typeof updateResult.rev === 'string')

      const { body } = await getDoc(put_doc_id)
      assert.strictEqual(body?.count, 2)
      initialRev = updateResult.rev
    })

    await t.test('reports conflicts when revision is stale', async () => {
      if (!initialRev) throw new Error('Expected revision to be captured')
      const staleRev = initialRev
      const latest = await saveDoc(put_doc_id, {
        _rev: staleRev,
        type: 'integration',
        count: 3
      })

      const result = await put(baseConfig, {
        _id: put_doc_id,
        _rev: staleRev,
        type: 'integration',
        count: 4
      })
      assert.ok(result)
      assert.strictEqual(result.ok, false)
      assert.strictEqual(result.error, 'conflict')
      assert.strictEqual(result.statusCode, 409)

      const { body } = await getDoc(put_doc_id)
      assert.strictEqual(body?.count, 3)
      initialRev = latest.rev
    })
  })
})
