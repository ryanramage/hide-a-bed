import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { TrackedEmitter } from './impl/utils/trackedEmitter.mts'
import { bulkSaveTransaction, get } from './index.mts'
import { bindConfig } from './impl/bindConfig.mts'
import z from 'zod'
import { TEST_DB_URL } from './test/setup-db.mts'
import {
  TransactionRollbackError,
  TransactionVersionConflictError
} from './impl/utils/transactionErrors.mts'

const config: Parameters<typeof get>[0] = {
  couch: TEST_DB_URL,
  bindWithRetry: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logger: (level: string, ...args: any[]) => {
    console.log(`[${level.toUpperCase()}]`, ...args)
  }
}

suite('Database Tests', () => {
  test('full db tests', async t => {
    const db = bindConfig(config)
    const test_doc_id = `test-doc-${Date.now()}`

    await t.test('simple get/put', async () => {
      const doc = await db.put({ _id: test_doc_id, data: 'hello world' })
      assert.ok(doc.ok, 'Document created')
      const fetched = await db.get(test_doc_id)
      assert.strictEqual(fetched?.data, 'hello world', 'Fetched document matches')
    })
    await t.test('get with no document', async () => {
      const notThereDoc = await get(config, 'test-doc-not-there')
      assert.strictEqual(notThereDoc, null)
    })
    await t.test('override config with different options', async () => {
      try {
        await db.options({ throwOnGetNotFound: true }).get('test-doc-not-there-override')
        assert.fail('should have thrown')
      } catch (e: unknown) {
        if (!(e instanceof Error)) throw e
        console.error(e)
        assert.strictEqual(e.name, 'NotFoundError')
      }
    })
    await t.test('get with no document and throwOnGetNotFound', async () => {
      const _config = { couch: TEST_DB_URL, throwOnGetNotFound: true }
      try {
        await get(_config, 'test-doc-not-there')
        assert.fail('should have thrown')
      } catch (e: unknown) {
        if (!(e instanceof Error)) throw e
        console.log(e.message)
        assert.strictEqual(e.name, 'NotFoundError')
      }
    })
    await t.test('put with bad rev', async () => {
      const doc = { _id: 'notThereDoc', _rev: '32-does-not-compute' }
      const notThereDoc = await db.put(doc)
      assert.ok(!notThereDoc.ok)
      assert.strictEqual(notThereDoc.error, 'conflict')
      console.log(notThereDoc)
    })
    await t.test('bulk get, including one doc that does not exist', async () => {
      const results = await db.bulkGet([test_doc_id, 'notThereDoc'])
      assert.strictEqual(results.rows?.length, 2, 'two rows returned')
      assert.strictEqual(results.rows[0].id, test_doc_id)
      assert.strictEqual(results.rows[1].error, 'not_found')
      console.log(results)
    })
    await t.test('bulk get validates docs with schema', async () => {
      const schema_doc_id = `schema-doc-${Date.now()}`
      await db.put({ _id: schema_doc_id, kind: 'example', data: 'hello' })

      const schema = z.looseObject({
        _id: z.string(),
        kind: z.literal('example'),
        data: z.string()
      })

      const validated = await db.bulkGet([schema_doc_id], {
        validate: {
          docSchema: schema
        }
      })
      assert.strictEqual(validated.rows[0].doc?.kind, 'example', 'doc schema applied')

      await assert.rejects(
        async () =>
          db.bulkGet([schema_doc_id], {
            validate: {
              docSchema: z.object({
                _id: z.string(),
                data: z.number()
              })
            }
          }),
        (err: unknown) => Array.isArray(err)
      )
    })
    await t.test('get validates docs with schema', async () => {
      const docId = `get-schema-doc-${Date.now()}`
      const { rev } = await db.put({
        _id: docId,
        kind: 'example',
        data: 'hello'
      })

      const schema = z.looseObject({
        _id: z.string(),
        kind: z.literal('example'),
        data: z.string()
      })

      const validated = await db.get(docId, {
        validate: {
          docSchema: schema
        }
      })
      assert.strictEqual(validated?.kind, 'example', 'doc schema applied to get')

      const atRev = await db.getAtRev(docId, rev!, {
        validate: {
          docSchema: schema
        }
      })
      assert.strictEqual(atRev?.data, 'hello', 'getAtRev also validates doc schema')

      await assert.rejects(
        async () =>
          get(config, docId, {
            validate: {
              docSchema: z.object({
                _id: z.string(),
                data: z.number()
              })
            }
          }),
        (err: unknown) => Array.isArray(err) && err[0].message.includes('Invalid input:')
      )
    })
    let _rev: string | null | undefined = null
    const [doc_a, doc_b, doc_rollback] = ['a', 'b', 'rollback'].map(
      x => `rev-test-doc-${x}-${Date.now()}`
    )
    await t.test('a transaction', async () => {
      const docs = [{ _id: doc_a, data: 'something' }]
      const resp = await bulkSaveTransaction(config, `transaction-${Date.now()}`, docs)
      assert.strictEqual(resp.length, 1, 'one response')
      assert.strictEqual(resp[0].ok, true, 'response ok')
      _rev = resp[0].rev
      assert.ok(resp)
    })
    await t.test('a transaction with a bad initial rev', async () => {
      try {
        const docs = [
          { _id: doc_a, data: 'something' },
          { _id: doc_b, data: 'new doc' }
        ]
        await bulkSaveTransaction(config, 'random-1', docs)
        assert.fail('should have thrown')
      } catch (e) {
        assert.ok(e)
      }
    })
    let b_rev: string | null | undefined = null
    await t.test('a new and an existing doc', async () => {
      const docs = [
        { _id: doc_a, data: 'something', _rev },
        { _id: doc_b, data: 'new doc' }
      ]
      const resp = await bulkSaveTransaction(config, `transaction-${Date.now()}`, docs)
      assert.ok(resp)
      assert.strictEqual(resp.length, 2, 'one response')
      assert.strictEqual(resp[0].ok, true, 'response ok')
      _rev = resp[0].rev
      b_rev = resp[1].rev
      assert.strictEqual(resp[1].ok, true, 'response ok')
      assert.ok(resp[0].rev?.startsWith('2-'), 'second rev saved')
    })

    await t.test(
      'testing a rollback where one doc was interfered with in the transaction',
      async () => {
        const _config = config
        const emitter = new TrackedEmitter({ delay: 300 })
        config['~emitter'] = emitter
        const docs = [
          { _id: doc_a, data: 'before-rollback', _rev }, // this doc gets interfered with in-between commit - so will be 'interfered'
          { _id: doc_rollback, data: 'new doc' }, // this doc will get removed
          { _id: doc_b, _rev: b_rev, data: 'should-not-be' } // this will not be committed. result will be from b doc above 'new doc'
        ]
        const transactionId = `transaction-${Date.now()}`
        emitter.on('transaction-started', async txnDoc => {
          assert.strictEqual(txnDoc._id, `txn:${transactionId}`, 'transaction id matches')
          // lets change something!
          docs[0].data = 'interfered'
          const interfereResp = await db.put(docs[0])
          assert.ok(interfereResp.ok, 'interfered with the transaction')
        })
        try {
          await bulkSaveTransaction(_config, transactionId, docs)
          assert.fail('should have thrown')
        } catch (e: unknown) {
          if (!(e instanceof TransactionRollbackError)) throw e
          assert.ok(e)
          console.log(e)
          assert.strictEqual(e.name, 'TransactionRollbackError', 'correct error type thrown')

          // lets make sure doc a has data from before, and
          const finalDocs = await db.bulkGet([doc_a, doc_rollback, doc_b])
          assert.strictEqual(finalDocs.rows?.length, 3, 'two rows returned')
          assert.strictEqual(
            finalDocs.rows[0].doc?.data,
            'interfered',
            'doc has the interfered data'
          )
          assert.ok(!finalDocs.rows[1].doc, 'doc b was deleted, and not saved')
          assert.strictEqual(finalDocs.rows[2].doc?.data, 'new doc', 'doc b was rolled back')
        }
      }
    )
    await t.test('TransactionVersionConflictError test', async () => {
      const conflict_doc_id = `conflict-doc-${Date.now()}`
      const transactionId = `txn:conflict-error-${Date.now()}`
      // First create a doc
      await db.put({ _id: conflict_doc_id, data: 'original' })
      // Then try to update it with wrong rev
      try {
        await bulkSaveTransaction(config, transactionId, [
          { _id: conflict_doc_id, _rev: 'wrong-rev', data: 'new' }
        ])
        assert.fail('should have thrown TransactionVersionConflictError')
      } catch (e: unknown) {
        if (!(e instanceof TransactionVersionConflictError)) throw e
        assert.strictEqual(e.name, 'TransactionVersionConflictError', 'correct error type thrown')
        assert.deepStrictEqual(e.conflictingIds, [conflict_doc_id], 'includes conflicting doc ids')
      }
    })
    await t.test('TransactionVersionConflictError test 2, new doc with _rev', async () => {
      try {
        const transactionId = `txn:conflict-error-2-${Date.now()}`
        // Try to update a doc that doesn't exist with a rev
        await bulkSaveTransaction(config, transactionId, [
          { _id: 'nonexistent', _rev: '1-abc', data: 'test' }
        ])
        assert.fail('should have thrown TransactionVersionConflictError')
      } catch (e: unknown) {
        if (!(e instanceof TransactionVersionConflictError)) throw e
        assert.strictEqual(e.name, 'TransactionVersionConflictError', 'correct error type thrown')
      }
    })

    await t.test('locking tests', async t => {
      const lockOptions = {
        enableLocking: true,
        username: 'testUser'
      }

      // Test successful lock creation
      const lockDocId = `doc-to-lock-${Date.now()}`
      await t.test('create lock', async () => {
        const locked = await db.createLock(lockDocId, lockOptions)
        assert.ok(locked, 'Lock was created successfully')

        // Verify lock document exists
        const lockDoc = await db.get(`lock-${lockDocId}`)
        assert.ok(lockDoc, 'Lock document exists')
        assert.strictEqual(lockDoc.type, 'lock', 'Document is a lock')
        assert.strictEqual(lockDoc.locks, lockDocId, 'Correct document is locked')
        assert.strictEqual(lockDoc.lockedBy, 'testUser', 'Lock owned by correct user')
      })

      // Test lock conflict
      await t.test('lock conflict', async () => {
        const locked = await db.createLock(lockDocId, lockOptions)
        assert.ok(!locked, 'Second lock attempt failed')
      })

      // Test unlock
      await t.test('unlock document', async () => {
        await db.removeLock(lockDocId, lockOptions)
        const lockDoc = await db.get(`lock-${lockDocId}`)
        assert.ok(!lockDoc, 'Lock document was removed')
      })

      // Test unlock by different user
      await t.test('unlock by different user', async () => {
        // Create lock as testUser
        await db.createLock(lockDocId, lockOptions)

        // Try to unlock as different user
        const differentUserOptions = {
          ...lockOptions,
          username: 'differentUser'
        }
        await db.removeLock(lockDocId, differentUserOptions)

        // Verify lock still exists
        const lockDoc = await db.get(`lock-${lockDocId}`)
        assert.ok(lockDoc, 'Lock still exists')
        assert.strictEqual(lockDoc.lockedBy, 'testUser', 'Lock still owned by original user')
      })

      // Test with locking disabled
      await t.test('disabled locking', async () => {
        const disabledOptions = {
          ...lockOptions,
          enableLocking: false
        }
        const locked = await db.createLock('doc-to-lock-2', disabledOptions)
        assert.ok(locked, 'Lock creation returns true when disabled')

        const lockDoc = await db.get('lock-doc-to-lock-2')
        assert.ok(!lockDoc, 'No lock document created when disabled')
      })

      await t.test('empty keys on bulkGet', async () => {
        const results = await db.bulkGet([])
        console.log(results)
        assert.deepStrictEqual(results.rows, [], 'empty array returns empty object')
      })

      await t.test('get db info', async () => {
        const results = await db.getDBInfo()
        assert.ok(results)
        assert.strictEqual(results.db_name, 'hide-a-bed-test-db')
      })
    })
    await t.test('bulkRemove', async () => {
      const results = await db.bulkRemove(['test-doc-never51'])
      assert.ok(results)
      assert.strictEqual(results.length, 0) // not an actual doc

      const remove_doc_id = `test-doc-remove-51-${Date.now()}`
      const doc = await db.put({ _id: remove_doc_id, data: 'hello world' })
      assert.ok(doc.ok, 'Document created')
      const results2 = await db.bulkRemove([remove_doc_id])
      assert.ok(results2)
      assert.strictEqual(results2.length, 1)
    })
    await t.test('bulkRemoveMap', async () => {
      const results = await db.bulkRemoveMap(['test-doc-never52'])
      assert.ok(results)
      assert.strictEqual(results.length, 0) // not an actual doc

      const remove_doc_id = `test-doc-remove-52-${Date.now()}`
      const doc = await db.put({ _id: remove_doc_id, data: 'hello world' })
      assert.ok(doc.ok, 'Document created')
      const results2 = await db.bulkRemoveMap([remove_doc_id])
      assert.ok(results2)
      assert.strictEqual(results2.length, 1)
    })
    await t.test('bulk save', async () => {
      const doc_a_id = `bulk-save-doc-a-${Date.now()}`
      // make sure docs with no id are accepted
      const docs = [{ first: true }, { _id: doc_a_id, second: true }]
      const results = await db.bulkSave(docs)
      assert.strictEqual(results.length, 2, 'two rows returned')
      assert.ok(results[0].id)
      assert.strictEqual(results[1].id, doc_a_id, 'id matches')
    })
    await t.test('a view query with only keys', async () => {
      const docs = [
        { _id: `query-1-${Date.now()}` },
        { _id: `query-2-${Date.now()}`, included: true },
        { _id: `query-3-${Date.now()}` }
      ]
      // create a view
      await db.put({
        _id: '_design/test',
        views: {
          test: {
            map: 'function(doc) { if (!doc.included) return; emit(doc._id, null); }'
          }
        }
      })
      await db.bulkSave(docs)
      const queryResults = await db.query('_design/test/_view/test', {
        keys: [docs[1]._id]
      })
      assert.strictEqual(queryResults.rows?.length, 1, 'one row returned')
      assert.strictEqual(queryResults.rows[0].key, docs[1]._id, 'key matches')
    })
    await t.test('all docs query', async () => {
      const query_results = await db.query('_all_docs', {})
      assert.ok(query_results.rows)
    })
    await t.test('not found doc', async () => {
      // should not throw
      const notFound = await db.get('never-51st')
      console.log('found status', notFound)
    })

    await t.test('remove test', async () => {
      // First create a document to delete
      const remove_doc_id = `delete-test-doc-${Date.now()}`
      const doc = await db.put({ _id: remove_doc_id, data: 'to be deleted' })
      assert.ok(doc.ok, 'Document created successfully')

      // Verify the document exists
      const fetchedDoc = await db.get(remove_doc_id)
      assert.strictEqual(fetchedDoc?.data, 'to be deleted', 'Document exists and has correct data')

      // Delete the document
      const deleteResult = await db.remove(remove_doc_id, fetchedDoc._rev as string)
      assert.ok(deleteResult.ok, 'Document deleted successfully')

      // Verify the document no longer exists
      const deletedDoc = await db.get(remove_doc_id)
      assert.strictEqual(deletedDoc, null, 'Document was successfully deleted')
    })
  })
})
