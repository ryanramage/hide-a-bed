// @ts-check
import needle from 'needle'
import { BulkSave, BulkGet, BulkRemove } from '../schema/bulk.mjs'

const opts = {
  json: true,
  headers: {
    'Content-Type': 'application/json'
  }
}

/** @type { import('../schema/bulk.mjs').BulkSaveSchema } */
export const bulkSave = BulkSave.implement(async (config, docs) => {
  if (!docs) return { ok: false, error: 'noDocs', reason: 'no docs provided' }
  if (!docs.length) return { ok: false, error: 'noDocs', reason: 'no docs provided' }

  const url = `${config.couch}/_bulk_docs`
  const body = { docs }
  const resp = await needle('post', url, body, opts)
  if (resp.statusCode !== 201) throw new Error('could not save')
  const results = resp?.body || []
  return results
})

/** @type { import('../schema/bulk.mjs').BulkGetSchema } */
export const bulkGet = BulkGet.implement(async (config, ids) => {
  const keys = ids
  const url = `${config.couch}/_all_docs?include_docs=true`
  const body = { keys }
  const resp = await needle('post', url, body, opts)
  if (resp.statusCode !== 200) throw new Error('could not fetch')
  const rows = resp?.body?.rows || []
  /** @type {Array<import('../schema/crud.mjs').CouchDocSchema>} */
  const docs = []
  rows.forEach((
    /** @type {{ error?: any, key?: string, doc?: import('../schema/crud.mjs').CouchDocSchema }} */ r
  ) => {
    if (r.error) return
    if (!r.key) return
    if (!r.doc) return
    /** @type { import('../schema/crud.mjs').CouchDocSchema } */
    const doc = r.doc
    docs.push(doc)
  })
  return docs
})

/** @type { import('../schema/bulk.mjs').BulkRemoveSchema } */
export const bulkRemove = BulkRemove.implement(async (config, ids) => {
  const docs = await bulkGet(config, ids)
  docs.forEach(d => { d._deleted = true })
  return bulkSave(config, docs)
})
