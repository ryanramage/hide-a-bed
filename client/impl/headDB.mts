import { RetryableError, createResponseError } from './utils/errors.mts'
import { createLogger } from './utils/logger.mts'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { fetchCouchJson } from './utils/fetch.mts'
import { isSuccessStatusCode } from './utils/response.mts'
import { createCouchDbUrl } from './utils/url.mts'

/**
 * Performs a health check against the target CouchDB database using `HEAD /{db}`.
 *
 * @see {@link https://docs.couchdb.org/en/stable/api/database/common.html#head--db | CouchDB API Documentation}
 *
 * @param configInput - The CouchDB configuration input.
 * @returns A promise that resolves to `true` when the database responds successfully.
 * @throws {RetryableError} `RetryableError` If a retryable error occurs during the request.
 * @throws {OperationError} For other non-retryable response failures.
 */
export const headDB = async (configInput: CouchConfigInput): Promise<true> => {
  const config = CouchConfig.parse(configInput)
  const logger = createLogger(config)
  const url = createCouchDbUrl(config.couch)

  let resp
  try {
    resp = await fetchCouchJson({
      auth: config.auth,
      method: 'HEAD',
      operation: 'headDB',
      request: config.request,
      url
    })

    if (!isSuccessStatusCode('database', resp.statusCode)) {
      logger.error(`Non-success status code received: ${resp.statusCode}`)
      throw createResponseError({
        body: resp.body,
        defaultMessage: 'Database health check failed',
        operation: 'headDB',
        statusCode: resp.statusCode
      })
    }
  } catch (err) {
    logger.error('Error during head operation:', err)
    RetryableError.handleNetworkError(err, 'headDB')
  }

  if (!resp) {
    logger.error('No response received from head request')
    throw new RetryableError('Database health check failed', 503, {
      operation: 'headDB'
    })
  }

  return true
}
