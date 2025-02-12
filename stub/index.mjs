import PouchDB from 'pouchdb'
import PouchMemoryAdaptor from 'pouchdb-adapter-memory'
import lodash from 'lodash'
import { schema, createQuery } from 'hide-a-bed'
PouchDB.plugin(PouchMemoryAdaptor)
const { cloneDeep } = lodash

const {
  BulkSave,
  BulkGet,
  BulkRemove,
  BulkGetDictionary,
  CouchPut,
  CouchGet,
  SimpleViewQuery,
  SimpleViewQueryStream,
  Patch,
  CouchGetAtRev
} = schema

export const setup = async (designDocs) => {
  const db = new PouchDB('dbname', { adapter: 'memory' })

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

  return { 
    bulkSave, 
    bulkGet, 
    bulkGetDictionary,
    put, 
    get, 
    patch, 
    patchDangerously: patch,
    getAtRev,
    createQuery,
    bulkRemove, 
    query, 
    queryStream 
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
