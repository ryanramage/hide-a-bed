// @ts-check
import needle from 'needle'

const opts = {
  json: true,
  headers: {
    'Content-Type': 'application/json'
  }
}

export async function bulkSave (config, docs) {
  if (!docs) return
  if (!docs.length) return

  const url = `${config.couch}/_bulk_docs`
  const body = { docs }
  const resp = await needle('post', url, body, opts)
  if (resp.statusCode !== 201) throw new Error('could not save')
  const results = resp?.body || []
  return results
}

export async function bulkGet (config, ids) {
  const keys = ids
  const url = `${config.couch}/_all_docs?include_docs=true`
  const body = { keys }
  const resp = await needle('post', url, body, opts)
  if (resp.statusCode !== 200) throw new Error('could not fetch')
  const rows = resp?.body?.rows || []
  const docs = []
  rows.forEach(r => {
    if (r.error) return
    if (!r.key) return
    if (!r.doc) return
    docs.push(r.doc)
  })
  return docs
}

export async function bulkRemove (config, ids) {
  const docs = await bulkGet(config, ids)
  docs.forEach(d => { d._deleted = true })
  return bulkSave(config, docs)
}
