import { TrackedEmitter } from '../impl/trackedEmitter.mjs'
import test from 'tap'
import { spawn } from 'child_process'
import { bindConfig, bulkSaveTransaction, get } from '../index.mjs'
import needle from 'needle'

const PORT = 8985
const DB_URL = `http://localhost:${PORT}/testdb`
const config = {
  couch: DB_URL,
  bindWithRetry: true,
  logger: (level, ...args) => {
    console.log(`[${level.toUpperCase()}]`, ...args)
  }
}

let server
test.test('full db tests', async t => {
  console.log('Starting PouchDB Server...')
  server = spawn('node_modules/.bin/pouchdb-server', ['--in-memory', '--port', PORT.toString()], { stdio: 'inherit' })
  await new Promise((resolve) => setTimeout(resolve, 1000)) // Give it time to start
  await needle('put', DB_URL)
  console.log('PouchDB Server started and database created at', DB_URL)
  t.teardown(() => { server.kill() })

  const db = bindConfig(config)
  t.test('simple get/put', async t => {
    const doc = await db.put({ _id: 'testdoc', data: 'hello world' })
    t.ok(doc.ok, 'Document created')
    const fetched = await db.get('testdoc')
    t.equal(fetched.data, 'hello world', 'Fetched document matches')
    t.end()
  })
  t.test('get with no document', async t => {
    const notThereDoc = await get(config, 'testdoc-not-there')
    t.equal(notThereDoc, null)
    t.end()
  })
  t.test('override config with different options', async t => {
    try {
      await db.options({ throwOnGetNotFound: true }).get('testdoc-not-there-override')
      t.fail('should have thrown')
    } catch (e) {
      t.equal(e.name, 'NotFoundError')
      t.end()
    }
  })
  t.test('get with no document and throwOnGetNotFound', async t => {
    const _config = { couch: DB_URL, throwOnGetNotFound: true }
    try {
      await get(_config, 'testdoc-not-there')
      t.fail('should have thrown')
    } catch (e) {
      console.log(e.message)
      t.equal(e.name, 'NotFoundError')
      t.end()
    }
  })
  t.test('put with bad rev', async t => {
    const doc = { _id: 'notThereDoc', _rev: '32-does-not-compute' }
    const notThereDoc = await db.put(doc)
    t.notOk(notThereDoc.ok)
    t.equal(notThereDoc.error, 'conflict')
    console.log(notThereDoc)
    t.end()
  })
  t.test('bulk get, including one doc that does not exist', async t => {
    const results = await db.bulkGet(['testdoc', 'notThereDoc'])
    t.equal(results.rows.length, 2, 'two rows returned')
    t.equal(results.rows[0].id, 'testdoc')
    t.equal(results.rows[1].error, 'not_found')
    console.log(results)
    t.end()
  })
  let _rev
  t.test('a transaction', async t => {
    const docs = [{ _id: 'a', data: 'somethig' }]
    const resp = await bulkSaveTransaction(config, 'fsda', docs)
    t.equal(resp.length, 1, 'one response')
    t.equal(resp[0].ok, true, 'response ok')
    _rev = resp[0].rev
    t.ok(resp)
    t.end()
  })
  t.test('a transaction with a bad initial rev', async t => {
    try {
      const docs = [{ _id: 'a', data: 'somethig' }, { _id: 'b', data: 'new doc' }]
      await bulkSaveTransaction(config, 'fsda-1', docs)
      t.fail('should have thrown')
    } catch (e) {
      t.ok(e)
      t.end()
    }
  })
  let brev = null
  t.test('a new and an existing doc', async t => {
    const docs = [{ _id: 'a', data: 'somethig', _rev }, { _id: 'b', data: 'new doc' }]
    const resp = await bulkSaveTransaction(config, 'fsda-2', docs)
    t.ok(resp)
    t.equal(resp.length, 2, 'one response')
    t.equal(resp[0].ok, true, 'response ok')
    _rev = resp[0].rev
    brev = resp[1].rev
    t.equal(resp[1].ok, true, 'response ok')
    t.ok(resp[0].rev.startsWith('2-'), 'second rev saved')
    t.end()
  })

  t.test('testing a rollback were one doc was interfered with in the transaction', async t => {
    const _config = config
    _config.mockDelay = 3000
    const emitter = new TrackedEmitter({ delay: 300 })
    config._emitter = emitter
    const docs = [
      { _id: 'a', data: 'before-rollback', _rev }, // this doc gets interfered with in-between commit - so will be 'interfered'
      { _id: 'rollback2', data: 'new doc' }, // this doc will get removed
      { _id: 'b', _rev: brev, data: 'should-not-be' } // this will not be committed. result will be from b doc above 'new doc'
    ]
    emitter.on('transaction-started', async txnDoc => {
      t.equal(txnDoc._id, 'txn:fsda-3', 'transaction id matches')
      // lets change something!
      docs[0].data = 'interfered'
      const interferResp = await db.put(docs[0])
      t.ok(interferResp.ok, 'interfered with the transaction')
    })
    try {
      await bulkSaveTransaction(_config, 'fsda-3', docs)
      t.fail('should have thrown')
    } catch (e) {
      t.ok(e)
      console.log(e)
      t.equal(e.name, 'TransactionRollbackError', 'correct error type thrown')

      // lets make sure doc a has data from before, and
      const finalDocs = await db.bulkGet(['a', 'rollback2', 'b'])
      t.equal(finalDocs.rows.length, 3, 'two rows returned')
      t.equal(finalDocs.rows[0].doc.data, 'interfered', 'doc has the intereferd data')
      t.notOk(finalDocs.rows[1].doc, 'doc b was deleted, and not saved')
      t.equal(finalDocs.rows[2].doc.data, 'new doc', 'doc b was rolled back')
      t.end()
    }
  })
  t.test('TransactionVersionConflictError test', async t => {
    // First create a doc
    await db.put({ _id: 'conflict-test', data: 'original' })
    // Then try to update it with wrong rev
    try {
      await bulkSaveTransaction(config, 'conflict-error', [
        { _id: 'conflict-test', _rev: 'wrong-rev', data: 'new' }
      ])
      t.fail('should have thrown TransactionVersionConflictError')
    } catch (e) {
      t.equal(e.name, 'TransactionVersionConflictError', 'correct error type thrown')
      t.same(e.conflictingIds, ['conflict-test'], 'includes conflicting doc ids')
      t.end()
    }
  })
  t.test('TransactionVersionConflictError test 2, new doc with _rev', async t => {
    try {
      // Try to update a doc that doesn't exist with a rev
      await bulkSaveTransaction(config, 'bulk-error', [
        { _id: 'nonexistent', _rev: '1-abc', data: 'test' }
      ])
      t.fail('should have thrown TransactionVersionConflictError')
    } catch (e) {
      t.equal(e.name, 'TransactionVersionConflictError', 'correct error type thrown')
      t.end()
    }
  })

  t.test('locking tests', async t => {
    const lockOptions = {
      enableLocking: true,
      username: 'testUser'
    }

    // Test successful lock creation
    t.test('create lock', async t => {
      const locked = await db.createLock('doc-to-lock', lockOptions)
      t.ok(locked, 'Lock was created successfully')

      // Verify lock document exists
      const lockDoc = await db.get('lock-doc-to-lock')
      t.ok(lockDoc, 'Lock document exists')
      t.equal(lockDoc.type, 'lock', 'Document is a lock')
      t.equal(lockDoc.locks, 'doc-to-lock', 'Correct document is locked')
      t.equal(lockDoc.lockedBy, 'testUser', 'Lock owned by correct user')
      t.end()
    })

    // Test lock conflict
    t.test('lock conflict', async t => {
      const locked = await db.createLock('doc-to-lock', lockOptions)
      t.notOk(locked, 'Second lock attempt failed')
      t.end()
    })

    // Test unlock
    t.test('unlock document', async t => {
      await db.removeLock('doc-to-lock', lockOptions)
      const lockDoc = await db.get('lock-doc-to-lock')
      t.notOk(lockDoc, 'Lock document was removed')
      t.end()
    })

    // Test unlock by different user
    t.test('unlock by different user', async t => {
      // Create lock as testUser
      await db.createLock('doc-to-lock', lockOptions)

      // Try to unlock as different user
      const differentUserOptions = {
        ...lockOptions,
        username: 'differentUser'
      }
      await db.removeLock('doc-to-lock', differentUserOptions)

      // Verify lock still exists
      const lockDoc = await db.get('lock-doc-to-lock')
      t.ok(lockDoc, 'Lock still exists')
      t.equal(lockDoc.lockedBy, 'testUser', 'Lock still owned by original user')
      t.end()
    })

    // Test with locking disabled
    t.test('disabled locking', async t => {
      const disabledOptions = {
        ...lockOptions,
        enableLocking: false
      }
      const locked = await db.createLock('doc-to-lock-2', disabledOptions)
      t.ok(locked, 'Lock creation returns true when disabled')

      const lockDoc = await db.get('lock-doc-to-lock-2')
      t.notOk(lockDoc, 'No lock document created when disabled')
      t.end()
    })
  })
})
