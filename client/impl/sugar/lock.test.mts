import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import needle from 'needle'
import type { CouchConfigInput } from '../../schema/config.mts'
import { createLock, removeLock } from './lock.mts'
import { TEST_DB_URL } from '../../test/setup-db.mts'

const baseConfig: CouchConfigInput = {
  couch: TEST_DB_URL,
  useConsoleLogger: true
}

async function fetchLockDoc(docId: string) {
  return await needle('get', `${TEST_DB_URL}/lock-${docId}`, null, {
    json: true
  })
}

suite('lock', () => {
  test('integration with pouchdb-server', async t => {
    await t.test('creates a lock document when enabled', async () => {
      const docId = `lock-creates-${Date.now()}`
      const created = await createLock(baseConfig, docId, {
        enableLocking: true,
        username: 'alice'
      })
      assert.strictEqual(created, true)

      const response = await fetchLockDoc(docId)
      assert.strictEqual(response.statusCode, 200)
      const body = response.body as { lockedBy: string; locks: string }
      assert.strictEqual(body.lockedBy, 'alice')
      assert.strictEqual(body.locks, docId)
    })

    await t.test('returns true without writing when locking disabled', async () => {
      const docId = `lock-disabled-${Date.now()}`
      const created = await createLock(baseConfig, docId, {
        enableLocking: false,
        username: 'anyone'
      })
      assert.strictEqual(created, true)

      const response = await fetchLockDoc(docId)
      assert.strictEqual(response.statusCode, 404)
    })

    await t.test('returns false on conflict and keeps existing lock', async () => {
      const docId = `lock-conflict-${Date.now()}`
      await createLock(baseConfig, docId, {
        enableLocking: true,
        username: 'alice'
      })
      const created = await createLock(baseConfig, docId, {
        enableLocking: true,
        username: 'bob'
      })
      assert.strictEqual(created, false)

      const response = await fetchLockDoc(docId)
      assert.strictEqual(response.statusCode, 200)
      const body = response.body as { lockedBy: string }
      assert.strictEqual(body.lockedBy, 'alice')
    })

    await t.test('removes lock when owned by caller', async () => {
      const docId = `lock-remove-${Date.now()}`
      await createLock(baseConfig, docId, {
        enableLocking: true,
        username: 'alice'
      })
      await removeLock(baseConfig, docId, {
        enableLocking: true,
        username: 'alice'
      })

      const response = await fetchLockDoc(docId)
      assert.strictEqual(response.statusCode, 404)
    })

    await t.test('skips removal when lock owned by someone else', async () => {
      const docId = `lock-remove-others-${Date.now()}`
      await createLock(baseConfig, docId, {
        enableLocking: true,
        username: 'alice'
      })
      await removeLock(baseConfig, docId, {
        enableLocking: true,
        username: 'bob'
      })

      const response = await fetchLockDoc(docId)
      assert.strictEqual(response.statusCode, 200)
      const body = response.body as { lockedBy: string }
      assert.strictEqual(body.lockedBy, 'alice')
    })

    await t.test('respects disabled removal', async () => {
      const docId = `lock-disabled-remove-${Date.now()}`
      await createLock(baseConfig, docId, {
        enableLocking: true,
        username: 'alice'
      })
      await removeLock(baseConfig, docId, {
        enableLocking: false,
        username: 'alice'
      })

      const response = await fetchLockDoc(docId)
      assert.strictEqual(response.statusCode, 200)
    })
  })
})
