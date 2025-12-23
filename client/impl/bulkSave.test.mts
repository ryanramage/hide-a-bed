import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import needle from 'needle'
import type { CouchConfigInput } from '../schema/config.mts'
import { bulkSave, bulkSaveTransaction } from './bulkSave.mts'
import { RetryableError } from './utils/errors.mts'
import {
  TransactionRollbackError,
  TransactionVersionConflictError
} from './utils/transactionErrors.mts'
import { TEST_DB_URL } from '../test/setup-db.mts'

const baseConfig: CouchConfigInput = {
  couch: TEST_DB_URL,
  useConsoleLogger: true
}

const transactionBaseConfig: CouchConfigInput = {
  couch: TEST_DB_URL,
  bindWithRetry: false,
  useConsoleLogger: true
}

type EventRecord = { event: string; payload: unknown }

function createTestEmitter() {
  const events: EventRecord[] = []
  const handlers = new Map<string, Array<(payload: unknown) => Promise<void> | void>>()

  return {
    events,
    on(event: string, handler: (payload: unknown) => Promise<void> | void) {
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
    },
    async emit(event: string, payload: unknown) {
      events.push({ event, payload })
      const list = handlers.get(event)
      if (!list) return
      for (const handler of list) {
        await handler(payload)
      }
    }
  }
}

async function saveDoc(dbUrl: string, id: string, body: Record<string, unknown>) {
  const response = await needle('put', `${dbUrl}/${id}`, { _id: id, ...body }, { json: true })

  if (response.statusCode !== 201 && response.statusCode !== 200) {
    throw new Error(`Failed to save document ${id}: ${response.statusCode}`)
  }

  return response.body as { rev: string }
}

async function getDocFrom(dbUrl: string, id: string) {
  return needle('get', `${dbUrl}/${id}`, null, { json: true })
}

async function getDoc(id: string) {
  return getDocFrom(TEST_DB_URL, id)
}

suite('bulkSave', () => {
  test('rejects invalid config arguments', async () => {
    await assert.rejects(async () => {
      // @ts-expect-error intentionally passing unsupported option
      await bulkSave({ couch: TEST_DB_URL, unsupported: true }, [
        { _id: 'bad-config-doc', count: 1 }
      ])
    })
  })

  test('throws error if called with no docs', async () => {
    await assert.rejects(async () => {
      // @ts-expect-error testing no docs
      await bulkSave(baseConfig, null)
    })
    await assert.rejects(async () => {
      await bulkSave(baseConfig, [])
    })
  })

  test('propagates retryable network failures', async () => {
    const offlineConfig: CouchConfigInput = {
      couch: 'http://localhost:6554/offline-bulk-save'
    }

    await assert.rejects(
      () => bulkSave(offlineConfig, [{ _id: 'offline-doc', count: 1 }]),
      (err: unknown) => err instanceof RetryableError && err.statusCode === 503
    )
  })

  test('integration with pouchdb-server', async t => {
    let docTwoInitialRev: string | undefined
    const docs = [
      { _id: `bulk-save-doc-1-${Date.now()}`, type: 'integration', count: 1 },
      { _id: `bulk-save-doc-2-${Date.now()}`, type: 'integration', count: 2 }
    ]

    await t.test('creates documents via _bulk_docs', async () => {
      const results = await bulkSave(baseConfig, docs)
      assert.strictEqual(results.length, 2)
      const [first, second] = results
      assert.ok(first)
      assert.strictEqual(first.id, docs[0]._id)
      assert.strictEqual(first.ok, true)
      assert.ok(second)
      assert.strictEqual(second.id, docs[1]._id)
      assert.strictEqual(second.ok, true)

      docTwoInitialRev = second.rev ?? undefined
      assert.ok(typeof docTwoInitialRev === 'string')

      const { statusCode, body } = await getDoc(docs[0]._id)
      assert.strictEqual(statusCode, 200)
      assert.strictEqual(body?.type, 'integration')
      assert.strictEqual(body?.count, 1)
    })

    await t.test('updates documents when revision supplied', async () => {
      const current = await getDoc(docs[1]._id)
      assert.strictEqual(current.statusCode, 200)
      const updateResults = await bulkSave(baseConfig, [
        {
          _id: docs[1]._id,
          _rev: current.body?._rev,
          type: 'integration',
          count: 3
        }
      ])

      assert.strictEqual(updateResults.length, 1)
      const [updated] = updateResults
      assert.ok(updated)
      assert.strictEqual(updated.ok, true)
      assert.ok(updated.rev)

      const { body } = await getDoc(docs[1]._id)
      assert.strictEqual(body?.count, 3)
    })

    await t.test('reports conflicts when revision is stale', async () => {
      if (!docTwoInitialRev) throw new Error('Expected initial revision to be captured')

      const conflictResults = await bulkSave(baseConfig, [
        {
          _id: docs[1]._id,
          _rev: docTwoInitialRev,
          type: 'integration',
          count: 99
        }
      ])

      assert.strictEqual(conflictResults.length, 1)
      const [conflict] = conflictResults
      assert.ok(conflict)
      assert.strictEqual(conflict.id, docs[1]._id)
      assert.strictEqual(conflict.error, 'conflict')
      assert.ok(conflict.reason)
    })
  })
})

suite('bulkSaveTransaction', () => {
  test('integration with pouchdb-server', async t => {
    await t.test('completes transaction for new and existing docs', async () => {
      const emitter = createTestEmitter()
      const config: CouchConfigInput = {
        ...transactionBaseConfig,
        '~emitter': emitter
      }

      const existingId = `txn-existing-success-${Date.now()}`
      const newId = `txn-new-success-${Date.now()}`
      const transactionId = `bulk-transaction-success-${Date.now()}`

      const existing = await saveDoc(TEST_DB_URL, existingId, {
        type: 'transaction',
        count: 1
      })

      const docs = [
        {
          _id: existingId,
          _rev: existing.rev,
          type: 'transaction',
          count: 2
        },
        { _id: newId, type: 'transaction', count: 1 }
      ]

      const results = await bulkSaveTransaction(config, transactionId, docs)
      assert.strictEqual(results.length, 2)
      assert.ok(results[0]?.ok)
      assert.strictEqual(results[0]?.id, existingId)
      assert.ok(results[1]?.ok)
      assert.strictEqual(results[1]?.id, newId)

      const updatedExisting = await getDocFrom(TEST_DB_URL, existingId)
      assert.strictEqual(updatedExisting.statusCode, 200)
      assert.strictEqual(updatedExisting.body?.count, 2)

      const createdDoc = await getDocFrom(TEST_DB_URL, newId)
      assert.strictEqual(createdDoc.statusCode, 200)
      assert.strictEqual(createdDoc.body?.count, 1)

      const transactionDoc = await getDocFrom(TEST_DB_URL, `txn:${transactionId}`)
      assert.strictEqual(transactionDoc.statusCode, 200)
      assert.strictEqual(transactionDoc.body?.status, 'completed')

      assert.ok(emitter.events.some(({ event }) => event === 'transaction-created'))
      assert.ok(emitter.events.some(({ event }) => event === 'transaction-completed'))
    })

    await t.test('throws TransactionVersionConflictError when revisions mismatch', async () => {
      const emitter = createTestEmitter()
      const config: CouchConfigInput = {
        ...transactionBaseConfig,
        '~emitter': emitter
      }

      const docId = `txn-conflict-doc-${Date.now()}`
      const transactionId = `bulk-transaction-conflict-${Date.now()}`

      const first = await saveDoc(TEST_DB_URL, docId, {
        type: 'conflict',
        count: 1
      })
      await saveDoc(TEST_DB_URL, docId, {
        _rev: first.rev,
        type: 'conflict',
        count: 2
      })
      await assert.rejects(
        () =>
          bulkSaveTransaction(config, transactionId, [
            {
              _id: docId,
              _rev: first.rev,
              type: 'conflict',
              count: 3
            }
          ]),
        (err: unknown) =>
          err instanceof TransactionVersionConflictError && err.conflictingIds.includes(docId)
      )

      assert.ok(emitter.events.some(({ event }) => event === 'transaction-created'))
      assert.ok(emitter.events.some(({ event }) => event === 'transaction-revs-fetched'))
    })

    await t.test('rolls back changes when bulk save fails', async () => {
      const emitter = createTestEmitter()
      const config: CouchConfigInput = {
        ...transactionBaseConfig,
        '~emitter': emitter
      }

      const successId = `txn-rollback-existing-${Date.now()}`
      const conflictId = `txn-rollback-conflict-${Date.now()}`
      const transactionId = `bulk-transaction-rollback-${Date.now()}`

      const existing = await saveDoc(TEST_DB_URL, successId, {
        type: 'rollback',
        count: 1
      })
      const conflicting = await saveDoc(TEST_DB_URL, conflictId, {
        type: 'rollback',
        count: 1
      })

      emitter.on('transaction-revs-checked', async () => {
        await needle(
          'put',
          `${TEST_DB_URL}/${conflictId}`,
          {
            _id: conflictId,
            _rev: conflicting.rev,
            type: 'rollback',
            count: 99
          },
          { json: true }
        )
      })

      await assert.rejects(
        () =>
          bulkSaveTransaction(config, transactionId, [
            { _id: successId, _rev: existing.rev, type: 'rollback', count: 2 },
            {
              _id: conflictId,
              _rev: conflicting.rev,
              type: 'rollback',
              count: 2
            }
          ]),
        (err: unknown) => err instanceof TransactionRollbackError
      )

      const rolledBack = await getDocFrom(TEST_DB_URL, successId)
      assert.strictEqual(rolledBack.statusCode, 200)
      assert.strictEqual(rolledBack.body?.count, 1)

      const conflicted = await getDocFrom(TEST_DB_URL, conflictId)
      assert.strictEqual(conflicted.statusCode, 200)
      assert.strictEqual(conflicted.body?.count, 99)

      const transactionDoc = await getDocFrom(TEST_DB_URL, `txn:${transactionId}`)
      assert.strictEqual(transactionDoc.statusCode, 200)
      assert.strictEqual(transactionDoc.body?.status, 'rolled_back')

      assert.ok(emitter.events.some(({ event }) => event === 'transaction-rolled-back'))
    })
  })
})
