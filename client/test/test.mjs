import test from 'tap'
import { spawn } from 'child_process'
import { bindConfig, bulkSaveTransaction } from '../index.mjs'
import needle from 'needle'

const PORT = 8985
const DB_URL = `http://localhost:${PORT}/testdb`
const config = { couch: DB_URL, bindWithRetry: true }

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
  t.test('a new and an existing doc', async t => {
    const docs = [{ _id: 'a', data: 'somethig', _rev }, { _id: 'b', data: 'new doc' }]
    const resp = await bulkSaveTransaction(config, 'fsda-2', docs)
    t.ok(resp)
    t.equal(resp.length, 2, 'one response')
    t.equal(resp[0].ok, true, 'response ok')
    t.equal(resp[1].ok, true, 'response ok')
    t.ok(resp[0].rev.startsWith('2-'), 'second rev saved')
    t.end()
  })
})
