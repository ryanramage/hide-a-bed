// @ts-check
import needle from 'needle'
import { BulkSave, BulkGet, BulkRemove } from '../schema/bulk.mjs'
import { RetryableError } from './errors.mjs'
import { createLogger } from './logger.mjs'

const opts = {
  json: true,
  headers: {
    'Content-Type': 'application/json'
  }
}

/** @type { import('../schema/bulk.mjs').BulkSaveSchema } */
export const bulkSave = BulkSave.implement(async (config, docs) => {
  const logger = createLogger(config)
  
  if (!docs) {
    logger.warn('bulkSave called with no docs')
    return { ok: false, error: 'noDocs', reason: 'no docs provided' }
  }
  if (!docs.length) {
    logger.warn('bulkSave called with empty docs array')
    return { ok: false, error: 'noDocs', reason: 'no docs provided' }
  }

  logger.info(`Starting bulk save of ${docs.length} documents`)
  const url = `${config.couch}/_bulk_docs`
  const body = { docs }
  let resp
  try {
    resp = await needle('post', url, body, opts)
  } catch (err) {
    logger.error('Network error during bulk save:', err)
    RetryableError.handleNetworkError(err)
  }
  if (!resp) {
    logger.error('No response received from bulk save request')
    throw new RetryableError('no response', 503)
  }
  if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
    logger.warn(`Retryable status code received: ${resp.statusCode}`)
    throw new RetryableError('retryable error during bulk save', resp.statusCode)
  }
  if (resp.statusCode !== 201) {
    logger.error(`Unexpected status code: ${resp.statusCode}`)
    throw new Error('could not save')
  }
  const results = resp?.body || []
  return results
})

/** @type { import('../schema/bulk.mjs').BulkGetSchema } */
export const bulkGet = BulkGet.implement(async (config, ids) => {
  const logger = createLogger(config)
  const keys = ids
  
  logger.info(`Starting bulk get for ${keys.length} documents`)
  const url = `${config.couch}/_all_docs?include_docs=true`
  const body = { keys }
  let resp
  try {
    resp = await needle('post', url, body, opts)
  } catch (err) {
    logger.error('Network error during bulk get:', err)
    RetryableError.handleNetworkError(err)
  }
  if (!resp) {
    logger.error('No response received from bulk get request')
    throw new RetryableError('no response', 503)
  }
  if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
    logger.warn(`Retryable status code received: ${resp.statusCode}`)
    throw new RetryableError('retryable error during bulk get', resp.statusCode)
  }
  if (resp.statusCode !== 200) {
    logger.error(`Unexpected status code: ${resp.statusCode}`)
    throw new Error('could not fetch')
  }
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
  logger.info(`Successfully retrieved ${docs.length} documents`)
  return docs
})

/** @type { import('../schema/bulk.mjs').BulkRemoveSchema } */
export const bulkRemove = BulkRemove.implement(async (config, ids) => {
  const logger = createLogger(config)
  logger.info(`Starting bulk remove for ${ids.length} documents`)
  const docs = await bulkGet(config, ids)
  docs.forEach(d => { d._deleted = true })
  return bulkSave(config, docs)
})
