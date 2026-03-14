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
  CouchDoc,
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

  const bulkSave = BulkSave.implementAsync(async (_config, docs) => {
    const results = await db.bulkDocs(docs)
    return results
  })

  const bulkGet = BulkGet.implementAsync(async (_config, ids, options = {}) => {
    const includeDocs = options?.includeDocs ?? true
    const resp = await db.allDocs({ include_docs: includeDocs, keys: ids })

    const docSchema = includeDocs ? (options?.validate?.docSchema ?? options?.docSchema ?? CouchDoc) : undefined

    if (includeDocs && docSchema && Array.isArray(resp.rows)) {
      resp.rows = resp.rows.map(row => {
        if (!row.doc) return row
        return { ...row, doc: docSchema.parse(row.doc) }
      })
    }

    return resp
  })

  const put = CouchPut.implementAsync(async (_config, doc) => {
    const result = await db.put(doc)
    result.statusCode = 201
    return result
  })

  const query = SimpleViewQuery.implementAsync(async (_config, view, options) => {
    const query = cloneDeep(options)
    // views com in full couch views, convert to pouch '_design/tick/_view/byDripTS'
    const parts = view.split('/')
    const pouchView = [parts[1], parts[3]].join('/')

    if (options.startkey) query.startkey = options.startkey
    if (options.endkey) query.endkey = options.endkey

    const results = await db.query(pouchView, query)
    return results
  })

  const get = CouchGet.implementAsync(async (_config, id) => {
    try {
      return await db.get(id)
    } catch (error) {
      // if it's a 404, return an empty object
      if (error.status === 404) return null
      // otherwise throw the error
      throw error
    }
  })

  const patch = Patch.implementAsync(async (_config, id, properties) => {
    try {
      const doc = await db.get(id)
      if (!doc) return null
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
    } catch (error) {
      if (error.status === 404) return { ok: false, statusCode: 404, error: 'notFound' }
      // otherwise throw the error
      throw error
    }
  })

  const bulkRemove = BulkRemove.implementAsync(async (_config, ids) => {
    const resp = await bulkGet(_config, ids)
    const rows = resp.rows || []
    const deleteDocs = rows.map(row => ({
      ...row.doc,
      _deleted: true
    }))
    const results = await db.bulkDocs(deleteDocs)
    return results
  })

  const queryStream = SimpleViewQueryStream.implementAsync(async (_config, view, options, onRow) => {
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

  const getAtRev = CouchGetAtRev.implementAsync(async (_config, id, rev) => {
    try {
      return await db.get(id, { rev })
    } catch (error) {
      if (error.status === 404) return null
      // otherwise throw the error
      throw error
    }
  })

  const bulkGetDictionary = BulkGetDictionary.implementAsync(async (_config, ids, options = {}) => {
    const resp = await bulkGet(_config, ids, options)
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

  const bulkSaveTransaction = BulkSaveTransaction.implementAsync(async (_config, docs) => {
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

function convert(designDocs) {
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
