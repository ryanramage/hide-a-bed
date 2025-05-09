import { test } from 'tape'
import { setup } from '../index.mjs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const viewDoc = require('./assets/viewDocs.cjs')

test('basic', async t => {
  const config = { couch: 'http://localhost:5984' }
  const { get, put } = await setup([])
  const doc = { _id: 'test', test: 'test' }
  await put(config, doc)
  const result = await get(config, 'test')
  t.deepEqual(result._id, doc._id)
})

test('bulk', async t => {
  const config = { couch: 'http://localhost:5984' }
  const { bulkGet, bulkSave, bulkRemove } = await setup([])
  const docs = [{ _id: 'test1', test: 'test1' }, { _id: 'test2', test: 'test2' }, { _id: 'test3', test: 'test3' }]
  const resp = await bulkSave(config, docs)
  t.ok(resp[0].ok)
  t.ok(resp[1].ok)
  const result = await bulkGet(config, ['test1', 'test2'], true)
  t.deepEqual(result.rows[0].id, docs[0]._id)
  const removeResults = await bulkRemove(config, ['test1', 'test2'])
  t.equal(removeResults[0].ok, true)
  t.equal(removeResults[1].ok, true)
  const result2 = await bulkGet(config, ['test1', 'test2'], true)
  t.deepEqual(result2.rows.length, 2)
  t.notOk(result2.rows[0].doc)
  t.notOk(result2.rows[1].doc)
})

test('patch', async t => {
  const config = { couch: 'http://localhost:5984' }
  const { get, put, patch } = await setup([])
  const doc = { _id: 'test2', test: 'test' }
  const putResp = await put(config, doc)
  await patch(config, 'test2', { test: 'test2', _rev: putResp.rev })
  const result = await get(config, 'test2')
  t.deepEqual(result.test, 'test2')
})

test('patch conflict', async t => {
  const config = { couch: 'http://localhost:5984' }
  const { put, patch } = await setup([])
  const doc = { _id: 'test2-patch', test: 'test' }
  await put(config, doc)
  const patchResp = await patch(config, 'test2-patch', { test: 'test2', _rev: 'fake_rev' })
  t.deepEqual(patchResp.statusCode, 409)
})

test('query', async t => {
  const config = { couch: 'http://localhost:5984' }
  const { query, bulkSave } = await setup([viewDoc])
  // put some docs in
  const docs = [
    { _id: 'test6', test: 'test1' },
    { _id: 'test7', test: 'test2', application: { email: 'test@test.com' } },
    { _id: 'test8', test: 'test3' }
  ]
  await bulkSave(config, docs)
  const view = '_design/submission/_view/by_email'
  const options = { include_docs: true }

  const results = await query(config, view, options)
  t.deepEqual(results.rows.length, 1)
  t.deepEqual(results.rows[0].doc._id, 'test7')
})

test('queryStream', async t => {
  const config = { couch: 'http://localhost:5984' }
  const { queryStream } = await setup([viewDoc])
  const view = '_design/submission/_view/by_email'
  const options = { include_docs: true }
  let rowCount = 0
  const onRow = (row) => {
    rowCount++
    t.ok(row.doc._id === 'test7')
  }
  await queryStream(config, view, options, onRow)
  t.ok(rowCount === 1)
})

test('bind', async t => {
  const { bindConfig } = await setup([])
  const config = { couch: 'http://localhost:5984' }
  const db = bindConfig(config)
  const resp = await db.put({ _id: 'this-is-bound' })
  t.ok(resp.ok)
  t.end()
})

test('namespace', async t => {
  const config = { couch: 'http://localhost:5984' }
  {
    const { put } = await setup([], 'test1')
    const resp = await put(config, { _id: 'first-doc' })
    t.ok(resp.ok)
  }
  {
    const { put } = await setup([], 'test2')
    const resp = await put(config, { _id: 'first-doc' })
    t.ok(resp.ok)
  }
  t.end()
})

test('teardown', async t => {
  const config = { couch: 'http://localhost:5984' }
  let hab = await setup([], 'test3')
  const resp = await hab.put(config, { _id: 'first-doc' })
  t.ok(resp.ok)
  await hab.teardown()

  hab = await setup([], 'test3') // like another test suite, using the same name
  const resp2 = await hab.put(config, { _id: 'first-doc' })
  t.ok(resp2.ok)
  t.end()
})

test('not found does not throw', async t => {
  const config = { couch: 'http://localhost:5984' }
  const { get, getAtRev, patch } = await setup([])
  try {
    const result = await get(config, 'not-found')
    t.deepEqual(result, null)
    console.log('running get at rev')
    const getAtRevResult = await getAtRev(config, 'not-found', '2')
    t.deepEqual(getAtRevResult, null)
    console.log('running patch')
    const patchResult = await patch(config, 'not-found', { _rev: '2' })
    t.deepEqual(patchResult, { ok: false, statusCode: 404, error: 'notFound' })
  } catch (shouldNOt) {
    console.log(shouldNOt)
    t.fail('should not throw')
  } finally {
    t.end()
  }
})
