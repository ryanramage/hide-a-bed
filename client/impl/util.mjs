// @ts-check
import needle from 'needle'
import { RetryableError, NotFoundError } from './errors.mjs'
import { createLogger } from './logger.mjs'
import { GetDBInfo } from '../schema/util.mjs'

/** @type { import('../schema/util.mjs').GetDBInfoSchema} */
export const getDBInfo = GetDBInfo.implement(async (config) => {
  const logger = createLogger(config)
  const url = `${config.couch}`
  const opts = {
    ...(config.needle || {}),
    json: true,
    headers: {
      ...config.needle?.headers,
      'Content-Type': 'application/json'
    }
  }
  let resp
  try {
    resp = await needle('get', url, opts)
  } catch (err) {
    logger.error('Error during put operation:', err)
    RetryableError.handleNetworkError(err)
  }

  if (!resp) {
    logger.error('No response received from put request')
    throw new RetryableError('no response', 503)
  }
  const result = resp.body
  if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
    logger.warn(`Retryable status code received: ${resp.statusCode}`)
    throw new RetryableError(result.reason || 'retryable error', resp.statusCode)
  }
  return result
})
