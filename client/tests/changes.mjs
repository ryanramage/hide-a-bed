import { TrackedEmitter } from '../impl/trackedEmitter.mjs'
import test from 'tap'
import { spawn } from 'child_process'
import { bindConfig, bulkSaveTransaction, get } from '../index.mjs'
import needle from 'needle'

let PORT = 8985
let DB_URL = `http://localhost:${PORT}/testdb`

const config = {
  couch: DB_URL,
  bindWithRetry: true,
  logger: (level, ...args) => {
    console.log(`[${level.toUpperCase()}]`, ...args)
  }
}

let server
test.test('changes tests', async t => {
  console.log('Starting PouchDB Server...')
  server = spawn('node_modules/.bin/pouchdb-server', ['--in-memory', '--port', PORT.toString()], { stdio: 'inherit' })
  await new Promise((resolve) => setTimeout(resolve, 1000)) // Give it time to start
  await needle('put', DB_URL)
  console.log('PouchDB Server started and database created at', DB_URL)
  t.teardown(async () => { 
    await needle('delete', DB_URL)
    server.kill()
  })

  const db = bindConfig(config)

  t.test('basic changes feed', t => new Promise(async (resolve) => {
    const changesEmitter = await db.changes({ since: 'now', feed: 'longpoll' })
    t.ok(changesEmitter.on, 'changes emitter has on method')
    t.ok(changesEmitter.removeListener, 'changes emitter has removeListener method')
    t.ok(changesEmitter.stop, 'changes emitter has stop method')
    changesEmitter.on('change', change => {
      t.equal(change.id, 'test-changes-doc', 'change notification received')
      changesEmitter.stop()
      t.end()
      resolve()
    })
    await new Promise((resolve) => setTimeout(resolve, 1000)) // Give it time to start
    // Create a document to trigger a change
    await db.put({ _id: 'test-changes-doc', data: 'test' })
  }))

  t.test('document id', t => new Promise(async (resolve) => {
    const opts = { 
      since: 'now', 
      include_docs: true,
      feed: 'longpoll'
    }
    const changesEmitter = await db.changes(opts)
    changesEmitter.on('change', change => {
      if (change.id === 'test-a') {
        setTimeout(() => {
          resolve()
        }, 1000)
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 4000)) // Give it time to start
    // Create a document to trigger a change
    await db.put({ _id: 'test-changes-doc-2', data: 'test' })
    await db.put({ _id: 'test-a', data: 'test' })
  }))
})
