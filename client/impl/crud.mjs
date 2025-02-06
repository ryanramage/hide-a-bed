// @ts-check
import needle from 'needle'
import { CouchGet, CouchPut } from '../schema/crud.mjs'
import { RetryableError } from './errors.mjs'
import { createLogger } from './logger.mjs'

const opts = {
  json: true,
  headers: {
    'Content-Type': 'application/json'
  }
}

/** @type { import('../schema/crud.mjs').CouchGetSchema } */
export const get = CouchGet.implement(async (config, id) => {
  const logger = createLogger(config)
  const url = `${config.couch}/${id}`
  logger.info(`Getting document with id: ${id}`)

  try {
    const resp = await needle('get', url, opts)
    if (!resp) {
      logger.error('No response received from get request')
      throw new RetryableError('no response', 503)
    }
    if (resp.statusCode === 404) {
      logger.debug(`Document not found: ${id}`)
      return null
    }
    const result = resp?.body || {}
    if (resp.statusCode === 404) {
      if (config.throwOnGetNotFound) {
        logger.warn(`Document not found (throwing error): ${id}`)
        throw new Error(result.reason || 'not_found')
      } else {
        logger.debug(`Document not found (returning undefined): ${id}`)
        return undefined
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
    logger.info(`Successfully retrieved document: ${id}`)
    return result
  } catch (err) {
    logger.error('Error during get operation:', err)
    RetryableError.handleNetworkError(err)
  }
})

/** @type { import('../schema/crud.mjs').CouchPutSchema } */
export const put = CouchPut.implement(async (config, doc) => {
  const logger = createLogger(config)
  const url = `${config.couch}/${doc._id}`
  const body = doc

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
