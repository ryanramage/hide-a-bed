import { createLogger } from './utils/logger.mts'
import { NotFoundError, RetryableError, createResponseError } from './utils/errors.mts'
import { CouchPutResponse } from '../schema/couch/couch.output.schema.ts'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { fetchCouchJson } from './utils/fetch.mts'
import { isRecord, isSuccessStatusCode } from './utils/response.mts'
import { createCouchDocUrl } from './utils/url.mts'

type CouchMutationBody = {
  error?: string
  ok?: boolean
  reason?: string
  statusCode?: number
} & Record<string, unknown>

export const remove = async (configInput: CouchConfigInput, id: string, rev: string) => {
  const config = CouchConfig.parse(configInput)
  const logger = createLogger(config)
  const url = createCouchDocUrl(id, config.couch)
  url.searchParams.set('rev', rev)

  logger.info(`Deleting document with id: ${id}`)
  let resp
  try {
    resp = await fetchCouchJson({
      auth: config.auth,
      method: 'DELETE',
      operation: 'remove',
      request: config.request,
      url
    })
  } catch (err) {
    logger.error('Error during delete operation:', err)
    RetryableError.handleNetworkError(err, 'remove')
  }

  if (!resp) {
    logger.error('No response received from delete request')
    throw new RetryableError('Remove failed', 503, { operation: 'remove' })
  }

  const result: CouchMutationBody = {
    ...(isRecord(resp.body) ? resp.body : {})
  }
  result.statusCode = resp.statusCode

  if (resp.statusCode === 404) {
    logger.warn(`Document not found for deletion: ${id}`)
    throw new NotFoundError(id, { operation: 'remove', statusCode: resp.statusCode })
  }

  if (!isSuccessStatusCode('documentDelete', resp.statusCode) || !result.ok) {
    logger.error(`Unexpected status code: ${resp.statusCode}`)
    throw createResponseError({
      body: resp.body,
      defaultMessage: 'Remove failed',
      docId: id,
      operation: 'remove',
      statusCode: resp.statusCode
    })
  }

  logger.info(`Successfully deleted document: ${id}`)
  return CouchPutResponse.parse(result)
}
