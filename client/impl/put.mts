import { createLogger } from './utils/logger.mts'
import { ConflictError, RetryableError, createResponseError } from './utils/errors.mts'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { CouchPutResponse, type CouchDoc } from '../schema/couch/couch.output.schema.ts'
import { z } from 'zod'
import { fetchCouchJson } from './utils/fetch.mts'
import { isRecord, isSuccessStatusCode } from './utils/response.mts'
import { createCouchDocUrl } from './utils/url.mts'

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
  const url = createCouchDocUrl(doc._id, config.couch)
  const body = doc

  logger.info(`Putting document with id: ${doc._id}`)
  let resp
  try {
    resp = await fetchCouchJson({
      auth: config.auth,
      method: 'PUT',
      operation: 'put',
      request: config.request,
      url,
      body
    })
  } catch (err) {
    logger.error('Error during put operation:', err)
    RetryableError.handleNetworkError(err, 'put')
  }

  if (!resp) {
    logger.error('No response received from put request')
    throw new RetryableError('Put failed', 503, { operation: 'put' })
  }

  const result: CouchMutationBody = {
    ...(isRecord(resp.body) ? resp.body : {})
  }
  result.statusCode = resp.statusCode

  if (resp.statusCode === 409) {
    logger.warn(`Conflict detected for document: ${doc._id}`)
    throw new ConflictError(doc._id, {
      couchError: typeof result.error === 'string' ? result.error : undefined,
      operation: 'put',
      statusCode: resp.statusCode
    })
  }

  if (!isSuccessStatusCode('documentWrite', resp.statusCode) || !result.ok) {
    logger.error(`Unexpected status code: ${resp.statusCode}`)
    throw createResponseError({
      body: resp.body,
      defaultMessage: 'Put failed',
      docId: doc._id,
      operation: 'put',
      statusCode: resp.statusCode
    })
  }

  logger.info(`Successfully saved document: ${doc._id}`)
  return CouchPutResponse.parse(result)
}
