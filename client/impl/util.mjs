// @ts-check
import needle from 'needle'
import { RetryableError } from './errors.mjs'
import { createLogger } from './logger.mjs'
import { GetDBInfo, MergeNeedleOpts } from '../schema/util.mjs'

/** @type { import('../schema/util.mjs').MergeNeedleOptsSchema} */
export const mergeNeedleOpts = MergeNeedleOpts.implement(
  (
  /**
   * @param {import('./schema/config.mjs').CouchConfigSchema} config
   * @param {Record<string, any>} opts
   */
    config,
    opts
  ) => {
    if (config.needleOpts) {
      return {
        ...opts,
        ...config.needleOpts,
        headers: {
          ...opts.headers,
          ...(config.needleOpts.headers || {})
        }
      }
    }

    return opts
  }
)

/** @type { import('../schema/util.mjs').GetDBInfoSchema} */
export const getDBInfo = GetDBInfo.implement(async (config) => {
  const logger = createLogger(config)
  const url = `${config.couch}`
  const opts = {
    json: true,
    headers: {
      'Content-Type': 'application/json'
    }
  }
  const mergedOpts = mergeNeedleOpts(config, opts)
  let resp
  try {
    resp = await needle('get', url, mergedOpts)
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
