import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import type { CouchConfigInput } from '../schema/config.mts'
import { get } from './get.mts'
import { patch, patchDangerously } from './patch.mts'
import { ConflictError, NotFoundError, OperationError } from './utils/errors.mts'
import { TEST_DB_URL } from '../test/setup-db.mts'
import { putJson } from '../test/http.mts'

const baseConfig: CouchConfigInput = {
  couch: TEST_DB_URL,
  initialDelay: 10,
  maxRetries: 2,
  backoffFactor: 1.2
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

suite('patch', () => {
  test('it will throw if provided config is invalid', async () => {
    await assert.rejects(async () => {
      // @ts-expect-error testing invalid config
      await patch({ notAnOption: true, couch: DB_URL, useConsoleLogger: true }, 'doc1', {
        foo: 'bar'
      })
    })

    await assert.rejects(async () => {
      await patchDangerously(
        // @ts-expect-error testing invalid config
        { anotherBadOption: 123, couch: DB_URL, useConsoleLogger: true },
        'doc1',
        { foo: 'bar' }
      )
    })
  })

  test('patch should throw if document revision is not provided', async () => {
    await assert.rejects(
      async () => {
        // @ts-expect-error testing missing _rev
        await patch(baseConfig, 'doc-no-rev', { foo: 'bar' })
      },
      {
        message: /_rev is required for patch operations/
      }
    )
  })

  test('integration with pouchdb-server', async t => {
    const patch_doc_id = `patch-doc-${Date.now()}`
    const initial = await saveDoc(patch_doc_id, { message: 'original' })

    await t.test('patch updates document when revision matches', async () => {
      const result = await patch(baseConfig, patch_doc_id, {
        _rev: initial.rev,
        message: 'patched',
        updated: true
      })
      assert.ok(result.ok)
      assert.ok(result.rev)

      const doc = await get(baseConfig, patch_doc_id)
      assert.strictEqual(doc?.message, 'patched')
      assert.strictEqual(doc?.updated, true)
    })

    await t.test('patch throws conflict on stale revision', async () => {
      const current = await get(baseConfig, patch_doc_id)
      const staleRev = initial.rev

      await assert.rejects(
        () =>
          patch(baseConfig, patch_doc_id, {
            _rev: staleRev,
            message: 'should-fail'
          }),
        (err: unknown) =>
          err instanceof ConflictError && err.docId === patch_doc_id && err.statusCode === 409
      )

      const doc = await get(baseConfig, patch_doc_id)
      assert.ok(doc)
      assert.ok(current)
      assert.strictEqual(doc.message, current.message)
    })

    await t.test('patchDangerously merges properties without revision', async () => {
      const result = await patchDangerously(baseConfig, patch_doc_id, {
        description: 'dangerously updated'
      })
      assert.ok(result?.ok)

      const doc = await get(baseConfig, patch_doc_id)
      assert.strictEqual(doc?.description, 'dangerously updated')
    })

    await t.test('patchDangerously throws not_found when document missing', async () => {
      await assert.rejects(
        () =>
          patchDangerously(baseConfig, 'missing-doc', {
            message: 'noop'
          }),
        (err: unknown) =>
          err instanceof NotFoundError && err.docId === 'missing-doc' && err.statusCode === 404
      )
    })

    await t.test('patchDangerously throws after exhausting retries', async () => {
      const doc = await get(baseConfig, patch_doc_id)
      const conflictConfig: CouchConfigInput = {
        ...baseConfig,
        maxRetries: 1,
        initialDelay: 1,
        backoffFactor: 1
      }

      await assert.rejects(
        () =>
          patchDangerously(conflictConfig, patch_doc_id, {
            _rev: initial.rev,
            conflicted: true
          }),
        (err: unknown) =>
          err instanceof OperationError && err.statusCode === 409 && err.message === 'Patch failed'
      )

      const current = await get(baseConfig, patch_doc_id)
      assert.ok(current)
      assert.ok(doc)
      assert.strictEqual(current.conflicted, undefined)
      assert.strictEqual(current._rev, doc._rev)
    })
  })
})
