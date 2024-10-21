// @ts-check
import needle from 'needle'
import { CouchGet, CouchPut } from '../schema/crud.mjs'

const opts = {
  json: true,
  headers: {
    'Content-Type': 'application/json'
  }
}

export const get = CouchGet.implement(async (config, id) => {
  const url = `${config.couch}/${id}`
  const resp = await needle('get', url, opts)
  const result = resp?.body || {}
  if (resp.statusCode !== 200) { throw new Error('not found') }
  return result
})

export const put = CouchPut.implement(async (config, doc) => {
  const url = `${config.couch}/${doc._id}`
  const body = doc
  const resp = await needle('put', url, body, opts)
  const result = resp?.body || {}
  result.statusCode = resp.statusCode
  if (resp.statusCode === 409) {
    result.ok = false
    result.error = 'conflict'
  }
  return result
})
