import { createLogger } from './utils/logger.mts'
import { RetryableError } from './utils/errors.mts'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { CouchPutResponse, type CouchDoc } from '../schema/couch/couch.output.schema.ts'
import { z } from 'zod'
import { fetchCouchJson } from './utils/fetch.mts'
import { getReason, isRecord } from './utils/response.mts'

type CouchMutationBody = {
  error?: string
  ok?: boolean
  reason?: string
  statusCode?: number
} & Record<string, unknown>

export const put = async (
  configInput: CouchConfigInput,
  doc: CouchDoc
): Promise<z.infer<typeof CouchPutResponse>> => {
  const config = CouchConfig.parse(configInput)
  const logger = createLogger(config)
  const url = `${config.couch}/${doc._id}`
  const body = doc

  logger.info(`Putting document with id: ${doc._id}`)
  let resp
  try {
    resp = await fetchCouchJson({
      auth: config.auth,
      method: 'PUT',
      url,
      body
    })
  } catch (err) {
    logger.error('Error during put operation:', err)
    RetryableError.handleNetworkError(err)
  }

  if (!resp) {
    logger.error('No response received from put request')
    throw new RetryableError('no response', 503)
  }

  const result: CouchMutationBody = {
    ...(isRecord(resp.body) ? resp.body : {})
  }
  result.statusCode = resp.statusCode

  if (resp.statusCode === 409) {
    logger.warn(`Conflict detected for document: ${doc._id}`)
    result.ok = false
    result.error = 'conflict'
    return CouchPutResponse.parse(result)
  }

  if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
    logger.warn(`Retryable status code received: ${resp.statusCode}`)
    throw new RetryableError(getReason(resp.body, 'retryable error'), resp.statusCode)
  }

  logger.info(`Successfully saved document: ${doc._id}`)
  return CouchPutResponse.parse(result)
}
