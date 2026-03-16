import { RetryableError, createResponseError } from './utils/errors.mts'
import { createLogger } from './utils/logger.mts'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { CouchDBInfo } from '../schema/couch/couch.output.schema.ts'
import { fetchCouchJson } from './utils/fetch.mts'
import { isSuccessStatusCode } from './utils/response.mts'

/**
 * Fetches and returns CouchDB database information.
 *
 * @see {@link https://docs.couchdb.org/en/stable/api/database/common.html#get--db | CouchDB API Documentation}
 *
 * @param configInput - The CouchDB configuration input.
 * @returns A promise that resolves to the CouchDB database information.
 * @throws {RetryableError} `RetryableError` If a retryable error occurs during the request.
 * @throws {OperationError} `OperationError` For other non-retryable response failures.
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
      operation: 'getDBInfo',
      request: config.request,
      url
    })

    if (!isSuccessStatusCode('database', resp.statusCode)) {
      logger.error(`Non-success status code received: ${resp.statusCode}`)
      throw createResponseError({
        body: resp.body,
        defaultMessage: 'Failed to fetch database info',
        operation: 'getDBInfo',
        statusCode: resp.statusCode
      })
    }
  } catch (err) {
    logger.error('Error during get operation:', err)
    RetryableError.handleNetworkError(err, 'getDBInfo')
  }

  if (!resp) {
    logger.error('No response received from get request')
    throw new RetryableError('Failed to fetch database info', 503, { operation: 'getDBInfo' })
  }

  return CouchDBInfo.parse(resp.body)
}
