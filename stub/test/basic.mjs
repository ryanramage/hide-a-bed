import { test } from 'tape'
import { setup } from '../index.mjs'

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
  const docs = [{ _id: 'test1', test: 'test1' }, { _id: 'test2', test: 'test2' }]
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

test('patch', async t => {
  const config = { couch: 'http://localhost:5984' }
  const {get, put, patch } = await setup([])
  const doc = { _id: 'test2', test: 'test' }
  await put(config, doc)
  await patch(config, 'test2', { test: 'test2' })
  const result = await get(config, 'test2')
  t.deepEqual(result.test, 'test2')
})

test('query', async t => {
  const config = { couch: 'http://localhost:5984' }
  const {query} = await setup([])
  

})
