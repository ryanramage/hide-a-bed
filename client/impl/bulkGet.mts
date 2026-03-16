import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { createLogger } from './utils/logger.mts'
import { RetryableError, createResponseError } from './utils/errors.mts'
import {
  ViewQueryResponse,
  type ViewQueryResponseValidated,
  CouchDoc,
  type ViewRowValidated
} from '../schema/couch/couch.output.schema.ts'
import type { StandardSchemaV1 } from '../types/standard-schema.ts'
import { parseRows, type OnInvalidDocAction } from './utils/parseRows.mts'
import { fetchCouchJson } from './utils/fetch.mts'
import { isSuccessStatusCode } from './utils/response.mts'

type BulkGetBody = {
  error?: string
  reason?: string
  rows?: unknown[]
} & Record<string, unknown>

export type BulkGetResponse<DocSchema extends StandardSchemaV1 = StandardSchemaV1<CouchDoc>> =
  ViewQueryResponseValidated<
    DocSchema,
    StandardSchemaV1,
    StandardSchemaV1<{
      rev: string
    }>
  >

export type BulkGetOptions<DocSchema extends StandardSchemaV1> = {
  includeDocs?: boolean
  validate?: {
    docSchema: DocSchema
    onInvalidDoc?: OnInvalidDocAction
  }
}

/**
 * Executes the bulk get operation against CouchDB.
 *
 * @param _config CouchDB configuration
 * @param ids Array of document IDs to retrieve
 * @param includeDocs Whether to include documents in the response
 *
 * @returns The raw response body from CouchDB
 *
 * @throws {RetryableError} When a retryable HTTP status code is encountered or no response is received.
 * @throws {OperationError} When CouchDB returns a non-retryable request-level failure.
 */
async function executeBulkGet(
  _config: CouchConfigInput,
  ids: Array<string | undefined>,
  includeDocs: boolean
): Promise<BulkGetBody | undefined> {
  const configParseResult = CouchConfig.safeParse(_config)
  const logger = createLogger(_config)
  logger.info(`Starting bulk get for ${ids.length} documents`)

  if (!configParseResult.success) {
    logger.error('Invalid configuration provided for bulk get', configParseResult.error)
    throw configParseResult.error
  }

  const config = configParseResult.data
  const url = `${config.couch}/_all_docs${includeDocs ? '?include_docs=true' : ''}`
  const payload = { keys: ids }

  try {
    const resp = await fetchCouchJson<BulkGetBody>({
      auth: config.auth,
      method: 'POST',
      operation: 'request',
      request: config.request,
      url,
      body: payload
    })
    if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
      logger.warn(`Retryable status code received: ${resp.statusCode}`)
      throw new RetryableError('Bulk get failed', resp.statusCode, {
        operation: 'request'
      })
    }
    if (!isSuccessStatusCode('bulkGet', resp.statusCode)) {
      logger.error(`Unexpected status code: ${resp.statusCode}`)
      throw createResponseError({
        body: resp.body,
        defaultMessage: 'Bulk get failed',
        operation: 'request',
        statusCode: resp.statusCode
      })
    }
    return resp.body
  } catch (err) {
    logger.error('Network error during bulk get:', err)
    RetryableError.handleNetworkError(err, 'request')
  }
}

/**
 * Bulk get documents by IDs with options.
 *
 * @template DocSchema - schema (StandardSchemaV1) used to validate each returned document, if provided.
 *
 * @param config - CouchDB configuration data that is validated before use.
 * @param ids - Array of document IDs to retrieve.
 * @param options - Options for bulk get operation, including whether to include documents and validation schema.
 *
 * @returns The bulk get response with rows optionally validated against the supplied document schema.
 *
 * @throws {RetryableError} When a retryable HTTP status code is encountered or no response is received.
 * @throws {ValidationError} When returned documents fail schema validation.
 * @throws {OperationError} When CouchDB returns a non-retryable request-level failure.
 */
async function _bulkGetWithOptions<DocSchema extends StandardSchemaV1 = typeof CouchDoc>(
  config: CouchConfigInput,
  ids: Array<string | undefined>,
  options: BulkGetOptions<DocSchema> = {}
): Promise<BulkGetResponse<DocSchema>> {
  const includeDocs = options.includeDocs ?? true
  const body = await executeBulkGet(config, ids, includeDocs)

  if (!body) {
    throw new RetryableError('Bulk get failed', 503, { operation: 'request' })
  }

  if (body.error) {
    throw createResponseError({
      body,
      defaultMessage: 'Bulk get failed',
      operation: 'request'
    })
  }

  const docSchema = options.validate?.docSchema || CouchDoc
  const rows = await parseRows(body.rows, {
    defaultMessage: 'Bulk get failed',
    onInvalidDoc: options.validate?.onInvalidDoc,
    operation: 'request',
    docSchema
  })

  return {
    ...body,
    rows
  }
}

/**
 * Bulk get documents by IDs.
 *
 * @remarks
 * By default, documents are included in the response. To exclude documents, set `includeDocs` to `false`.
 * When `includeDocs` is `true`, you can provide a schema (StandardSchemaV1) to validate the documents.
 * When a schema is provided, you can specify how to handle invalid documents using `onInvalidDoc` option.
 * `onInvalidDoc` can be set to `'throw'` (default) to throw an error on invalid documents, or `'skip'` to omit them from the results.
 *
 * @template DocSchema - schema (StandardSchemaV1) used to validate each returned document, if provided.
 *
 * @param config - CouchDB configuration data that is validated before use.
 * @param ids - Array of document IDs to retrieve.
 * @param options - Options for bulk get operation, including whether to include documents and validation schema.
 *
 * @returns The bulk get response with rows optionally validated against the supplied document schema.
 *
 * @throws {RetryableError} When a retryable HTTP status code is encountered or no response is received.
 * @throws {ValidationError} When returned documents fail schema validation.
 * @throws {OperationError} When CouchDB returns a non-retryable request-level failure.
 */
export async function bulkGet<DocSchema extends StandardSchemaV1 = typeof CouchDoc>(
  config: CouchConfigInput,
  ids: Array<string | undefined>,
  options: BulkGetOptions<DocSchema> = {}
) {
  return _bulkGetWithOptions<DocSchema>(config, ids, {
    includeDocs: options.includeDocs,
    validate: options?.validate
  })
}

/**
 * Bound version of bulkGet with config pre-applied.
 */
export type BulkGetBound = {
  (
    ids: string[],
    options?: {
      includeDocs?: boolean
    }
  ): Promise<ViewQueryResponse>
  <DocSchema extends StandardSchemaV1>(
    ids: string[],
    options?: BulkGetOptions<DocSchema>
  ): Promise<ViewQueryResponseValidated<DocSchema>>
}

/**
 * Bulk get documents by IDs and return a dictionary of found and not found documents.
 */

export type BulkGetDictionaryOptions<DocSchema extends StandardSchemaV1 = typeof CouchDoc> = Omit<
  BulkGetOptions<DocSchema>,
  'includeDocs'
>

export type BulkGetDictionaryResult<
  DocSchema extends StandardSchemaV1 = StandardSchemaV1<CouchDoc>
> = {
  found: Record<string, StandardSchemaV1.InferOutput<DocSchema>>
  notFound: Record<
    string,
    ViewRowValidated<DocSchema, StandardSchemaV1, StandardSchemaV1<{ rev: string }>>
  >
}

/**
 * Bulk get documents by IDs and return a dictionary of found and not found documents.
 *
 * @template DocSchema - Schema used to validate each returned document, if provided. Note: if a document is found and it fails validation this will throw a ValidationError.
 *
 * @param config - CouchDB configuration data that is validated before use.
 * @param ids - Array of document IDs to retrieve.
 * @param options - Options for bulk get operation, including validation schema.
 *
 * @returns An object containing found documents and not found rows.
 *
 * @throws {RetryableError} When a retryable HTTP status code is encountered or no response is received.
 * @throws {ValidationError} When returned documents fail schema validation.
 * @throws {OperationError} When CouchDB returns a non-retryable request-level failure.
 */
export async function bulkGetDictionary<DocSchema extends StandardSchemaV1 = typeof CouchDoc>(
  config: CouchConfigInput,
  ids: Array<string | undefined>,
  options?: Omit<BulkGetDictionaryOptions<DocSchema>, 'includeDocs'>
): Promise<BulkGetDictionaryResult<DocSchema>> {
  const response = await bulkGet(config, ids, {
    includeDocs: true,
    ...options
  })

  const results: BulkGetDictionaryResult<DocSchema> = {
    found: {},
    notFound: {}
  }

  for (const row of response.rows ?? []) {
    const key = typeof row.key === 'string' ? row.key : row.id
    if (!key) continue

    if (row.error || !row.doc) {
      results.notFound[key] = row
      continue
    }

    const doc = row.doc
    const docId =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (doc as any)?._id === 'string' ? (doc as any)._id : row.id

    if (!docId) {
      results.notFound[key] = row
      continue
    }

    results.found[docId] = doc
  }

  return results
}

export type BulkGetDictionaryBound = {
  <DocSchema extends StandardSchemaV1 = typeof CouchDoc>(
    ids: string[],
    options: BulkGetDictionaryOptions<DocSchema>
  ): Promise<BulkGetDictionaryResult<DocSchema>>
}
