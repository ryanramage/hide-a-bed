import needle, { type NeedleResponse } from 'needle'
import { RetryableError } from './utils/errors.mts'
import { createLogger } from './utils/logger.mts'
import { mergeNeedleOpts } from './utils/mergeNeedleOpts.mts'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { CouchDBInfo } from '../schema/couch/couch.output.schema.ts'

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

  let resp: NeedleResponse | undefined
  try {
    resp = await needle(
      'get',
      url,
      mergeNeedleOpts(config, {
        json: true,
        headers: {
          'Content-Type': 'application/json'
        }
      })
    )
  } catch (err) {
    logger.error('Error during get operation:', err)
    RetryableError.handleNetworkError(err)
  }

  if (!resp) {
    logger.error('No response received from get request')
    throw new RetryableError('no response', 503)
  }

  const result = resp.body
  if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
    logger.warn(`Retryable status code received: ${resp.statusCode}`)
    throw new RetryableError(result.reason ?? 'retryable error', resp.statusCode)
  }

  return CouchDBInfo.parse(result)
}
