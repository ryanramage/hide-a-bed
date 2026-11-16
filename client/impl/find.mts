import { z } from 'zod'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { fetchCouchJson } from './utils/fetch.mts'
import { createCouchPathUrl } from './utils/url.mts'
import { RetryableError, createResponseError, OperationError } from './utils/errors.mts'

import {
  MangoQuerySchema,
  createMangoResponseSchema,
  type MangoQuery,
  type MangoResponse
} from '../schema/couch/mango.schema.ts'

const MangoResponseSchema = createMangoResponseSchema(z.record(z.string(), z.unknown()))

// Retain the original names for consumers of the initial find API.
export type FindOptions = MangoQuery
export type FindResponse<Doc = Record<string, unknown>> = MangoResponse<Doc>

/** Query a Mango JSON index. Request controls come from config, as with query(). */
export async function find<Doc = Record<string, unknown>>(
  configInput: CouchConfigInput,
  options: MangoQuery
): Promise<MangoResponse<Doc>> {
  const config = CouchConfig.parse(configInput)
  const body = MangoQuerySchema.parse(options)
  let response
  try {
    response = await fetchCouchJson<MangoResponse<Doc> & { error?: string }>({
      auth: config.auth,
      request: config.request,
      method: 'POST',
      operation: 'find',
      url: createCouchPathUrl('_find', config.couch),
      body
    })
  } catch (error) {
    RetryableError.handleNetworkError(error, 'find')
  }
  if (response.statusCode !== 200 || response.body?.error) {
    throw createResponseError({
      body: response.body,
      defaultMessage: 'Mango query failed',
      operation: 'find',
      statusCode: response.statusCode
    })
  }
  const parsed = MangoResponseSchema.safeParse(response.body)
  if (!parsed.success) {
    throw new OperationError('Invalid Mango response', { operation: 'find' })
  }
  // The generic supplies compile-time document typing; use the exported response
  // factory with a document schema when runtime document validation is needed.
  return parsed.data as MangoResponse<Doc>
}

export type FindBound = <Doc = Record<string, unknown>>(
  options: MangoQuery
) => Promise<MangoResponse<Doc>>
