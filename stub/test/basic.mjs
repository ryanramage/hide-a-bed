import { test } from 'tape'
import { setup } from '../index.mjs'
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const viewDoc = require('./assets/viewDocs.cjs');

test('basic', async t => {
  const config = { couch: 'http://localhost:5984' }
  const {get, put} = await setup([])
  const doc = { _id: 'test', test: 'test' }
  await put(config, doc)
  const result = await get(config, 'test')
  t.deepEqual(result._id, doc._id)
})

test('bulk', async t => {
  const config = { couch: 'http://localhost:5984' }
  const {bulkGet, bulkSave, bulkRemove} = await setup([])
  const docs = [{ _id: 'test1', test: 'test1' }, { _id: 'test2', test: 'test2' }, { _id: 'test3', test: 'test3' }]
  const resp = await bulkSave(config, docs)
  t.ok(resp[0].ok)
  t.ok(resp[1].ok)
  const result = await bulkGet(config, ['test1', 'test2'])
  t.deepEqual(result[0]._id, docs[0]._id) 
  await bulkRemove(config, ['test1', 'test2'])
  const result2 = await bulkGet(config, ['test1', 'test2'])
  t.deepEqual(result2.length, 2)
  t.notOk(result2[0])
  t.notOk(result2[1])
})

test('bulkGet can have holes of null for missing docs', async t => {
  const config = { couch: 'http://localhost:5984' }
  const { bulkGet } = await setup([])
  const result = await bulkGet(config, ['test1332', 'test3'])
  t.ok(result)
  t.notOk(result[0])
  t.ok(result[1])
})

test('patch', async t => {
  const config = { couch: 'http://localhost:5984' }
  const {get, put, patch } = await setup([])
  const doc = { _id: 'test2', test: 'test' }
  const putResp = await put(config, doc)
  await patch(config, 'test2', { test: 'test2', _rev: putResp.rev })
  const result = await get(config, 'test2')
  t.deepEqual(result.test, 'test2')
})

test('patch conflict', async t => {
  const config = { couch: 'http://localhost:5984' }
  const {get, put, patch } = await setup([])
  const doc = { _id: 'test2-patch', test: 'test' }
  const putResp = await put(config, doc)
  const patchResp = await patch(config, 'test2-patch', { test: 'test2', _rev: 'fake_rev'})
  t.deepEqual(patchResp.statusCode, 409)
})

test('query', async t => {
  const config = { couch: 'http://localhost:5984' }
  const {query, bulkSave} = await setup([viewDoc])
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
  const {queryStream} = await setup([viewDoc])
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
