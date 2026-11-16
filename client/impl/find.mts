import { z } from 'zod'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { fetchCouchJson } from './utils/fetch.mts'
import { createCouchPathUrl } from './utils/url.mts'
import { RetryableError, createResponseError, OperationError } from './utils/errors.mts'

const FindOptions = z
  .object({
    selector: z.record(z.string(), z.unknown()),
    use_index: z.union([z.string(), z.tuple([z.string(), z.string()])]).optional(),
    limit: z.number().int().positive().optional(),
    bookmark: z.string().optional(),
    fields: z.array(z.string()).optional(),
    sort: z.array(z.union([z.string(), z.record(z.string(), z.enum(['asc', 'desc']))])).optional(),
    execution_stats: z.boolean().optional(),
    allow_fallback: z.boolean().optional()
  })
  .strict()

export type FindOptions = z.input<typeof FindOptions>
export type FindResponse<Doc = Record<string, unknown>> = {
  docs: Doc[]
  bookmark?: string
  warning?: string
  execution_stats?: Record<string, number>
}

/** Query a Mango JSON index. Request controls come from config, as with query(). */
export async function find<Doc = Record<string, unknown>>(
  configInput: CouchConfigInput,
  options: FindOptions
): Promise<FindResponse<Doc>> {
  const config = CouchConfig.parse(configInput)
  const body = FindOptions.parse(options)
  let response
  try {
    response = await fetchCouchJson<FindResponse<Doc> & { error?: string }>({
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
  if (!Array.isArray(response.body?.docs)) {
    throw new OperationError('Mango response is missing docs', { operation: 'find' })
  }
  return response.body
}

export type FindBound = <Doc = Record<string, unknown>>(
  options: FindOptions
) => Promise<FindResponse<Doc>>
