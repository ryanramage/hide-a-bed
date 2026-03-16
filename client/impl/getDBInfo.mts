import { RetryableError } from './utils/errors.mts'
import { createLogger } from './utils/logger.mts'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { CouchDBInfo } from '../schema/couch/couch.output.schema.ts'
import { fetchCouchJson } from './utils/fetch.mts'
import { getReason } from './utils/response.mts'

/**
 * Fetches and returns CouchDB database information.
 *
 * @see {@link https://docs.couchdb.org/en/stable/api/database/common.html#get--db | CouchDB API Documentation}
 *
 * @param configInput - The CouchDB configuration input.
 * @returns A promise that resolves to the CouchDB database information.
 * @throws {RetryableError} `RetryableError` If a retryable error occurs during the request.
 * @throws {Error} `Error` For other non-retryable errors.
 *
 * @example
 * ```ts
 * import { getDBInfo } from './impl/getDBInfo.mts';
 *
 * const config = { couch: 'http://localhost:5984/my-database' };
 *
 * getDBInfo(config)
 *   .then(info => {
 *     console.log('Database Info:', info);
 *   })
 *   .catch(err => {
 *     console.error('Error fetching database info:', err);
 *   });
 * ```
 */
export const getDBInfo = async (configInput: CouchConfigInput) => {
  const config = CouchConfig.parse(configInput)
  const logger = createLogger(config)
  const url = `${config.couch}`

  let resp
  try {
    resp = await fetchCouchJson({
      auth: config.auth,
      method: 'GET',
      request: config.request,
      url
    })

    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
        logger.warn(`Retryable status code received: ${resp.statusCode}`)
        const reason = getReason(resp.body, 'retryable error')
        throw new RetryableError(reason, resp.statusCode)
      } else {
        logger.error(`Non-retryable status code received: ${resp.statusCode}`)
        const reason = getReason(resp.body, 'error fetching database info')
        throw new Error(reason)
      }
    }
  } catch (err) {
    logger.error('Error during get operation:', err)
    RetryableError.handleNetworkError(err)
  }

  if (!resp) {
    logger.error('No response received from get request')
    throw new RetryableError('no response', 503)
  }

  if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
    logger.warn(`Retryable status code received: ${resp.statusCode}`)
    const reason = getReason(resp.body, 'retryable error')
    throw new RetryableError(reason, resp.statusCode)
  }

  debugger
  return CouchDBInfo.parse(resp.body)
}
