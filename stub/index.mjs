import PouchDB from 'pouchdb-memory'
import lodash from 'lodash'
import { schema, createQuery } from 'hide-a-bed'
// import { CreateLock, RemoveLock } from './schema/sugar/lock.mjs'
// import { WatchDocs } from './schema/sugar/watch.mjs'
// import { Changes } from './schema/changes.mjs'
import { EventEmitter } from 'events'
// PouchDB.plugin(PouchMemoryAdaptor)
const { cloneDeep } = lodash

const {
  BulkSave,
  BulkGet,
  BulkRemove,
  BulkGetDictionary,
  BulkSaveTransaction,
  CouchPut,
  CouchGet,
  SimpleViewQuery,
  SimpleViewQueryStream,
  Patch,
  CouchGetAtRev,
  Bind
} = schema

export const setup = async (designDocs, dbname) => {
  if (!dbname) dbname = 'dbname'
  const db = new PouchDB(dbname, { adapter: 'memory' })

  if (designDocs.length) {
    convert(designDocs)
    await db.bulkDocs(convert(designDocs))
  }

  const bulkSave = BulkSave.implement(async (_config, docs) => {
    const results = await db.bulkDocs(docs)
    return results
  })

  const bulkGet = BulkGet.implement(async (_config, ids) => {
    const options = { include_docs: true, keys: ids }
    const resp = await db.allDocs(options)
    return resp
  })

  const put = CouchPut.implement(async (_config, doc) => {
    const result = await db.put(doc)
    result.statusCode = 201
    return result
  })

  const query = SimpleViewQuery.implement(async (_config, view, options) => {
    const query = cloneDeep(options)
    // views com in full couch views, convert to pouch '_design/tick/_view/byDripTS'
    const parts = view.split('/')
    const pouchView = [parts[1], parts[3]].join('/')

    if (options.startkey) query.startkey = options.startkey
    if (options.endkey) query.endkey = options.endkey

    const results = await db.query(pouchView, query)
    return results
  })

  const get = CouchGet.implement(async (_config, id) => await db.get(id))

  const patch = Patch.implement(async (_config, id, properties) => {
    const doc = await db.get(id)
    if (doc._rev !== properties._rev) {
      const result = {}
      result.ok = false
      result.error = 'conflict'
      result.statusCode = 409
      return result
    }
    const updatedDoc = { ...doc, ...properties }
    const results = await db.put(updatedDoc)
    results.statusCode = 200
    return results
  })

  const bulkRemove = BulkRemove.implement(async (_config, ids) => {
    const resp = await bulkGet(_config, ids)
    const rows = resp.rows || []
    const deleteDocs = rows.map(row => ({
      ...row.doc,
      _deleted: true
    }))
    const results = await db.bulkDocs(deleteDocs)
    return results
  })

  const queryStream = SimpleViewQueryStream.implement(async (_config, view, options, onRow) => {
    const query = cloneDeep(options)
    const parts = view.split('/')
    const pouchView = [parts[1], parts[3]].join('/')

    if (options.startkey) query.startkey = options.startkey
    if (options.endkey) query.endkey = options.endkey

    const results = await db.query(pouchView, query)
    for (const row of results.rows) {
      await onRow(row)
    }
  })

  const getAtRev = CouchGetAtRev.implement(async (_config, id, rev) => {
    return db.get(id, { rev })
  })

  const bulkGetDictionary = BulkGetDictionary.implement(async (_config, ids) => {
    const resp = await bulkGet(_config, ids)
    const results = { found: {}, notFound: {} }

    resp.rows.forEach(row => {
      if (!row.key) return
      if (row.error) {
        results.notFound[row.key] = row
        return
      }
      if (row.doc) {
        results.found[row.id] = row.doc
      } else {
        results.notFound[row.key] = row
      }
    })

    return results
  })

  const bulkSaveTransaction = BulkSaveTransaction.implement(async (_config, docs) => {
    const results = await bulkSave(_config, docs)
    const errors = results.filter(result => !result.ok)
    if (errors.length) {
      const error = new Error('bulkSaveTransaction failed')
      error.errors = errors
      throw error
    }
    return results
  })

  const bindConfig = Bind.implement((config) => {
    return {
      get: get.bind(null, config),
      getAtRev: getAtRev.bind(null, config),
      put: put.bind(null, config),
      bulkGet: bulkGet.bind(null, config),
      bulkSave: bulkSave.bind(null, config),
      query: query.bind(null, config),
      queryStream: queryStream.bind(null, config),
      patch: patch.bind(null, config),
      patchDangerously: patch.bind(null, config),
      bulkRemove: bulkRemove.bind(null, config),
      bulkGetDictionary: bulkGetDictionary.bind(null, config),
      bulkSaveTransaction: bulkSaveTransaction.bind(null, config)
    }
  })

  const createLock = async (_config, _docId, _options) => {
    // Read mock behavior from config
    if (_config._mockLockSuccess === false) {
      return false
    }
    if (_config._mockLockError) {
      throw _config._mockLockError
    }
    return true
  }

  const removeLock = async (_config, _docId, _options) => {
    // Read mock behavior from config
    if (_config._mockUnlockError) {
      throw _config._mockUnlockError
    }
    // Success case just returns undefined
  }

  const watchDocs = (_config, _docIds, _onChange, _options = {}) => {
    const emitter = new EventEmitter()

    // Allow tests to trigger events via config._mockEmitEvent
    if (typeof _config._mockEmitEvent === 'function') {
      _config._mockEmitEvent(emitter)
    }

    return {
      on: (event, listener) => emitter.on(event, listener),
      removeListener: (event, listener) => emitter.removeListener(event, listener),
      stop: () => {
        emitter.emit('end', { lastSeq: 'now' })
        emitter.removeAllListeners()
      }
    }
  }

  const changes = async (_config, _onChange, options = {}) => {
    const emitter = new EventEmitter()

    // Set up PouchDB changes feed
    const feed = db.changes({
      since: options.since || 'now',
      live: true,
      include_docs: options.include_docs || false
    })

    // Forward all PouchDB events to our emitter
    feed.on('change', change => emitter.emit('change', change))
    feed.on('error', error => emitter.emit('error', error))
    feed.on('complete', () => emitter.emit('end'))

    return {
      on: (event, listener) => emitter.on(event, listener),
      removeListener: (event, listener) => emitter.removeListener(event, listener),
      stop: () => {
        feed.cancel()
        emitter.removeAllListeners()
      }
    }
  }

  const teardown = async () => {
    return await db.destroy()
  }

  return {
    bulkSave,
    bulkGet,
    bulkGetDictionary,
    bulkSaveTransaction,
    put,
    get,
    patch,
    patchDangerously: patch,
    getAtRev,
    createQuery,
    bulkRemove,
    query,
    queryStream,
    bindConfig,
    createLock,
    removeLock,
    watchDocs,
    changes,
    teardown
  }
}

function convert (designDocs) {
  return designDocs.map(ddoc => {
    const views = Object.keys(ddoc.views)
    views.forEach(viewName => {
      const view = ddoc.views[viewName]
      if (view.map) view.map = view.map.toString()
      if (view.reduce) view.reduce = view.reduce.toString()
    })
    return ddoc
  })
}
