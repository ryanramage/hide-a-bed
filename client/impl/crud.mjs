// @ts-check
import needle from 'needle'
import { CouchGet, CouchPut, CouchGetWithOptions, CouchGetAtRev } from '../schema/crud.mjs'
import { RetryableError, NotFoundError } from './errors.mjs'
import { createLogger } from './logger.mjs'

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
  logger.info(`Getting document with id: ${id}, rev ${rev || 'latest'}`)

  try {
    const resp = await needle('get', url, opts)
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

  logger.info(`Putting document with id: ${doc._id}`)
  let resp
  try {
    resp = await needle('put', url, body, opts)
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
