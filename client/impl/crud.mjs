// @ts-check
import needle from 'needle'
import { CouchGet, CouchPut } from '../schema/crud.mjs'
import { RetryableError } from './errors.mjs'

const opts = {
  json: true,
  headers: {
    'Content-Type': 'application/json'
  }
}

/** @type { import('../schema/crud.mjs').CouchGetSchema } */
export const get = CouchGet.implement(async (config, id) => {
  const url = `${config.couch}/${id}`
  try {
    const resp = await needle('get', url, opts)
    if (resp.statusCode === 404) return null
    const result = resp?.body || {}
    if (resp.statusCode === 404) {
      if (config.throwOnGetNotFound) throw new Error(result.reason || 'not_found') 
      else return undefined
    }
    if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
      throw new RetryableError(result.reason || 'retryable error', resp.statusCode)
    }
    if (resp.statusCode !== 200) {
      throw new Error(result.reason || 'failed')
    }
    return result
  } catch (err) {
    if (err.code) {
      if (err.code === 'ECONNREFUSED') throw new RetryableError('connection refused', 503)
      if (err.code === 'ECONNRESET') throw new RetryableError('connection reset', 503)
      if (err.code === 'ETIMEDOUT') throw new RetryableError('connection timeout', 503)
    } 
    else throw err
    
  }
})

/** @type { import('../schema/crud.mjs').CouchPutSchema } */
export const put = CouchPut.implement(async (config, doc) => {
  const url = `${config.couch}/${doc._id}`
  const body = doc
  const resp = await needle('put', url, body, opts)
  const result = resp?.body || {}
  result.statusCode = resp.statusCode
  if (resp.statusCode === 409) {
    result.ok = false
    result.error = 'conflict'
    return result
  }
  if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
    throw new RetryableError(result.reason || 'retryable error', resp.statusCode)
  }
  return result
})
