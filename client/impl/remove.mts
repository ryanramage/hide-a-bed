import { createLogger } from './utils/logger.mts'
import { RetryableError } from './utils/errors.mts'
import { CouchPutResponse } from '../schema/couch/couch.output.schema.ts'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { fetchCouchJson } from './utils/fetch.mts'
import { getReason, isRecord } from './utils/response.mts'

type CouchMutationBody = {
  error?: string
  ok?: boolean
  reason?: string
  statusCode?: number
} & Record<string, unknown>

export const remove = async (
  configInput: CouchConfigInput,
  id: string,
  rev: string
) => {
  const config = CouchConfig.parse(configInput)
  const logger = createLogger(config)
  const url = `${config.couch}/${id}?rev=${rev}`

  logger.info(`Deleting document with id: ${id}`)
  let resp
  try {
    resp = await fetchCouchJson({
      auth: config.auth,
      method: 'DELETE',
      request: config.request,
      url
    })
  } catch (err) {
    logger.error('Error during delete operation:', err)
    RetryableError.handleNetworkError(err)
  }

  if (!resp) {
    logger.error('No response received from delete request')
    throw new RetryableError('no response', 503)
  }

  const result: CouchMutationBody = {
    ...(isRecord(resp.body) ? resp.body : {})
  }
  result.statusCode = resp.statusCode

  if (resp.statusCode === 404) {
    logger.warn(`Document not found for deletion: ${id}`)
    result.ok = false
    result.error = 'not_found'
    return CouchPutResponse.parse(result)
  }

  if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
    logger.warn(`Retryable status code received: ${resp.statusCode}`)
    throw new RetryableError(getReason(resp.body, 'retryable error'), resp.statusCode)
  }

  if (resp.statusCode !== 200) {
    logger.error(`Unexpected status code: ${resp.statusCode}`)
    throw new Error(getReason(resp.body, 'failed'))
  }

  logger.info(`Successfully deleted document: ${id}`)
  return CouchPutResponse.parse(result)
}
