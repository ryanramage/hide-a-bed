import PouchDB from 'pouchdb'
import PouchMemoryAdaptor from 'pouchdb-adapter-memory'
import lodash from 'lodash'
import { schema } from 'hide-a-bed'
PouchDB.plugin(PouchMemoryAdaptor)
const { cloneDeep, set, unset } = lodash

const {
  BulkSave,
  BulkGet,
  BulkRemove,
  CouchPut,
  CouchGet,
  SimpleViewQuery,
  SimpleViewQueryStream,
  Patch
} = schema

export const setup = async (designDocs) => {
  const db = new PouchDB('dbname', { adapter: 'memory' })

  if (designDocs.length) {
    convert(designDocs)
    await db.bulkDocs(convert(designDocs))
  }

  const bulkSave = BulkSave.implement(async (_config, docs) => {
    return await db.bulkDocs(docs)
  })

  const bulkGet = BulkGet.implement(async (_config, ids) => {
    const options = { include_docs: true, keys: ids }
    const resp = await db.allDocs(options)
    const docs = resp.rows.map(row => row.doc)
    return docs
  })

  const put = CouchPut.implement(async (_config, doc) => {
    const result = await db.put(doc)
    result.statusCode = 201
    return result
  })

  const simpleViewQuery = SimpleViewQuery.implement(async (_config, view, options) => {
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

  const patch = Patch.implement(async (_config, id, operations) => {
    const doc = await db.get(id)
    operations.forEach(op => {
      if (op.op === 'add' || op.op === 'replace') {
        set(doc, op.path, op.value)
      } else if (op.op === 'remove') {
        unset(doc, op.path)
      }
    })
    return await db.put(doc)
  })

  const bulkRemove = BulkRemove.implement(async (_config, ids) => {
    const docs = await bulkGet(_config, ids)
    const deleteDocs = docs.map(doc => ({
      ...doc,
      _deleted: true
    }))
    console.log('doing the delte', deleteDocs)
    const results = await db.bulkDocs(deleteDocs)
    console.log('results', results)
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
    return results
  })

  return { bulkSave, bulkGet, put, get, patch, bulkRemove, simpleViewQuery, queryStream }
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
