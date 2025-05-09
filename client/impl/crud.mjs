// @ts-check
import needle from 'needle'
import { CouchGet, CouchPut, CouchGetWithOptions, CouchGetAtRev, CouchRemove } from '../schema/crud.mjs'
import { RetryableError, NotFoundError } from './errors.mjs'
import { createLogger } from './logger.mjs'
import { mergeNeedleOpts } from './util.mjs'

/** @type { import('../schema/crud.mjs').CouchGetWithOptionsSchema } */
const _getWithOptions = CouchGetWithOptions.implement(async (config, id, getOpts) => {
  const logger = createLogger(config)
  const rev = getOpts?.rev
  const path = rev ? `${id}?rev=${rev}` : id
  const url = `${config.couch}/${path}`
  const opts = {
    json: true,
    headers: {
      'Content-Type': 'application/json'
    }
  }
  const mergedOpts = mergeNeedleOpts(config, opts)
  logger.info(`Getting document with id: ${id}, rev ${rev || 'latest'}`)

  try {
    const resp = await needle('get', url, mergedOpts)
    if (!resp) {
      logger.error('No response received from get request')
      throw new RetryableError('no response', 503)
    }
    const result = resp?.body || {}
    if (resp.statusCode === 404) {
      if (config.throwOnGetNotFound) {
        logger.warn(`Document not found (throwing error): ${id}, rev ${rev || 'latest'}`)
        throw new NotFoundError(id, result.reason || 'not_found')
      } else {
        logger.debug(`Document not found (returning undefined): ${id}, rev ${rev || 'latest'}`)
        return null
      }
    }
    if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
      logger.warn(`Retryable status code received: ${resp.statusCode}`)
      throw new RetryableError(result.reason || 'retryable error', resp.statusCode)
    }
    if (resp.statusCode !== 200) {
      logger.error(`Unexpected status code: ${resp.statusCode}`)
      throw new Error(result.reason || 'failed')
    }
    logger.info(`Successfully retrieved document: ${id}, rev ${rev || 'latest'}`)
    return result
  } catch (err) {
    logger.error('Error during get operation:', err)
    RetryableError.handleNetworkError(err)
  }
})

/** @type { import('../schema/crud.mjs').CouchGetSchema } */
export const get = CouchGet.implement(async (config, id) => {
  const getOptions = {}
  return _getWithOptions(config, id, getOptions)
})

/** @type { import('../schema/crud.mjs').CouchGetAtRevSchema } */
export const getAtRev = CouchGetAtRev.implement(async (config, id, rev) => {
  const getOptions = { rev }
  return _getWithOptions(config, id, getOptions)
})

/** @type { import('../schema/crud.mjs').CouchPutSchema } */
export const put = CouchPut.implement(async (config, doc) => {
  const logger = createLogger(config)
  const url = `${config.couch}/${doc._id}`
  const body = doc
  const opts = {
    json: true,
    headers: {
      'Content-Type': 'application/json'
    }
  }
  const mergedOpts = mergeNeedleOpts(config, opts)

  logger.info(`Putting document with id: ${doc._id}`)
  let resp
  try {
    resp = await needle('put', url, body, mergedOpts)
  } catch (err) {
    logger.error('Error during put operation:', err)
    RetryableError.handleNetworkError(err)
  }

  if (!resp) {
    logger.error('No response received from put request')
    throw new RetryableError('no response', 503)
  }

  const result = resp?.body || {}
  result.statusCode = resp.statusCode

  if (resp.statusCode === 409) {
    logger.warn(`Conflict detected for document: ${doc._id}`)
    result.ok = false
    result.error = 'conflict'
    return result
  }

  if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
    logger.warn(`Retryable status code received: ${resp.statusCode}`)
    throw new RetryableError(result.reason || 'retryable error', resp.statusCode)
  }

  logger.info(`Successfully saved document: ${doc._id}`)
  return result
})

/** @type { import('../schema/crud.mjs').CouchRemoveSchema } */
export const remove = CouchRemove.implement(async (config, id, rev) => {
  const logger = createLogger(config)
  const url = `${config.couch}/${id}?rev=${rev}`
  const opts = {
    json: true,
    headers: {
      'Content-Type': 'application/json'
    }
  }
  const mergedOpts = mergeNeedleOpts(config, opts)

  logger.info(`Deleting document with id: ${id}`)
  let resp
  try {
    resp = await needle('delete', url, mergedOpts)
  } catch (err) {
    logger.error('Error during delete operation:', err)
    RetryableError.handleNetworkError(err)
  }

  if (!resp) {
    logger.error('No response received from delete request')
    throw new RetryableError('no response', 503)
  }

  let result
  if (typeof resp.body === 'string') {
    try {
      result = JSON.parse(resp.body)
    } catch (e) {
      result = {}
    }
  } else {
    result = resp.body || {}
  }
  result.statusCode = resp.statusCode

  if (resp.statusCode === 404) {
    logger.warn(`Document not found for deletion: ${id}`)
    result.ok = false
    result.error = 'not_found'
    return result
  }

  if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
    logger.warn(`Retryable status code received: ${resp.statusCode}`)
    throw new RetryableError(
      result.reason || 'retryable error',
      resp.statusCode
    )
  }

  if (resp.statusCode !== 200) {
    logger.error(`Unexpected status code: ${resp.statusCode}`)
    throw new Error(result.reason || 'failed')
  }

  logger.info(`Successfully deleted document: ${id}`)
  return result
})
