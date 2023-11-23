import PouchDB from 'pouchdb'
import PouchMemoryAdaptor from 'pouchdb-adapter-memory'
PouchDB.plugin(PouchMemoryAdaptor)
import lodash from 'lodash'
const { cloneDeep } = lodash
import { 
  BulkSave, 
  BulkGet,
  CouchPut,
  SimpleViewQuery
} from 'hide-a-bed'

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
    return await db.allDocs(options)
  })

  const put = CouchPut.implement(async (_config, doc) => await db.put(doc))

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

  return { bulkSave, bulkGet, put, simpleViewQuery }
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
