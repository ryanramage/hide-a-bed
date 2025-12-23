import needle from 'needle'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { createLogger } from './utils/logger.mts'
import { mergeNeedleOpts } from './utils/mergeNeedleOpts.mts'
import { RetryableError } from './utils/errors.mts'
import { z } from 'zod'
import {
  ViewRow,
  ViewQueryResponse,
  type ViewQueryResponseValidated,
  CouchDoc,
  type ViewRowValidated
} from '../schema/couch/couch.output.schema.ts'
import type { StandardSchemaV1 } from '../types/standard-schema.ts'

export type BulkGetResponse<DocSchema extends StandardSchemaV1 = StandardSchemaV1<CouchDoc>> =
  ViewQueryResponseValidated<
    DocSchema,
    StandardSchemaV1,
    StandardSchemaV1<{
      rev: string
    }>
  >

export type OnInvalidDocAction = 'throw' | 'skip'

export type BulkGetOptions<DocSchema extends StandardSchemaV1> = {
  includeDocs?: boolean
  validate?: {
    docSchema: DocSchema
    onInvalidDoc?: OnInvalidDocAction
  }
}

async function parseRows<DocSchema extends StandardSchemaV1>(
  rows: unknown,
  schema: DocSchema,
  onInvalidDoc: OnInvalidDocAction = 'throw'
) {
  if (!Array.isArray(rows)) {
    throw new Error('invalid rows format')
  }

  type FinalRow = {
    id?: string
    key?: string
    value?: unknown
    doc?: StandardSchemaV1.InferOutput<DocSchema>
    error?: string
  }
  type RowResult = FinalRow | 'skip'
  const isFinalRow = (row: RowResult): row is FinalRow => row !== 'skip'

  const parsedRows: Array<RowResult> = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows.map(async (row: any) => {
      try {
        /**
         * If no doc is present, parse without doc validation.
         * This allows handling of not-found documents or rows without docs.
         */
        if (row.doc == null) {
          return z.looseObject(ViewRow.shape).parse(row)
        }

        const parsedDoc = await schema['~standard'].validate(row.doc)

        if (parsedDoc.issues) {
          if (onInvalidDoc === 'throw') {
            throw parsedDoc.issues
          } else {
            // skip invalid doc
            return 'skip'
          }
        } else {
          const parsedRow = z
            .looseObject({
              id: z.string().optional(),
              key: z.any().nullish(),
              value: z.any().nullish(),
              error: z.string().optional()
            })
            .parse(row)

          return {
            ...parsedRow,
            doc: parsedDoc.value
          }
        }
      } catch (e) {
        if (onInvalidDoc === 'throw') {
          throw e
        } else {
          // skip invalid doc
          return 'skip'
        }
      }
    })
  )

  return parsedRows.filter(isFinalRow)
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
 * @throws {Error} When CouchDB returns a non-retryable error payload.
 */
async function executeBulkGet(
  _config: CouchConfigInput,
  ids: Array<string | undefined>,
  includeDocs: boolean
) {
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
  const opts = {
    json: true,
    headers: {
      'Content-Type': 'application/json'
    }
  }
  const mergedOpts = mergeNeedleOpts(config, opts)

  try {
    const resp = await needle('post', url, payload, mergedOpts)
    if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
      logger.warn(`Retryable status code received: ${resp.statusCode}`)
      throw new RetryableError('retryable error during bulk get', resp.statusCode)
    }
    if (resp.statusCode !== 200) {
      logger.error(`Unexpected status code: ${resp.statusCode}`)
      throw new Error('could not fetch')
    }
    return resp.body
  } catch (err) {
    logger.error('Network error during bulk get:', err)
    RetryableError.handleNetworkError(err)
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
 * @throws {Error<StandardSchemaV1.FailureResult["issues"]>} When the configuration or validation schemas fail to parse.
 * @throws {Error} When CouchDB returns a non-retryable error payload.
 */
async function _bulkGetWithOptions(
  config: CouchConfigInput,
  ids: Array<string | undefined>,
  options: { includeDocs: false }
): Promise<BulkGetResponse>

async function _bulkGetWithOptions<DocSchema extends StandardSchemaV1>(
  config: CouchConfigInput,
  ids: Array<string | undefined>,
  options: {
    includeDocs: true
    validate?: { docSchema: DocSchema; onInvalidDoc?: 'throw' | 'skip' }
  }
): Promise<BulkGetResponse<DocSchema>>

async function _bulkGetWithOptions<DocSchema extends StandardSchemaV1>(
  config: CouchConfigInput,
  ids: Array<string | undefined>,
  options: BulkGetOptions<DocSchema> = {}
): Promise<BulkGetResponse<DocSchema>> {
  const includeDocs = options.includeDocs ?? true
  const body = await executeBulkGet(config, ids, includeDocs)

  if (!body) {
    throw new RetryableError('no response', 503)
  }

  if (body.error) {
    throw new Error(typeof body.reason === 'string' ? body.reason : 'could not fetch')
  }

  const docSchema = options.validate?.docSchema || CouchDoc
  const rows = await parseRows(body.rows, docSchema, options.validate?.onInvalidDoc)

  return {
    ...body,
    rows
  }
}

export async function bulkGet(
  config: CouchConfigInput,
  ids: Array<string | undefined>
): Promise<BulkGetResponse>

export async function bulkGet(
  config: CouchConfigInput,
  ids: Array<string | undefined>,
  options: { includeDocs: false }
): Promise<BulkGetResponse>

export async function bulkGet<DocSchema extends StandardSchemaV1>(
  config: CouchConfigInput,
  ids: Array<string | undefined>,
  options: {
    includeDocs?: true
    validate?: { docSchema: DocSchema; onInvalidDoc?: 'throw' | 'skip' }
  }
): Promise<BulkGetResponse<DocSchema>>

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
 * @throws {Error<StandardSchemaV1.FailureResult["issues"]>} When the configuration or validation schemas fail to parse.
 * @throws {Error} When CouchDB returns a non-retryable error payload.
 */
export async function bulkGet<DocSchema extends StandardSchemaV1>(
  config: CouchConfigInput,
  ids: Array<string | undefined>,
  options: BulkGetOptions<DocSchema> = {}
) {
  if (options?.includeDocs === false) {
    return _bulkGetWithOptions(config, ids, {
      includeDocs: false
    })
  }

  return _bulkGetWithOptions<DocSchema>(config, ids, {
    includeDocs: true,
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

export type BulkGetDictionaryOptions<DocSchema extends StandardSchemaV1> = Omit<
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

export async function bulkGetDictionary(
  config: CouchConfigInput,
  ids: Array<string | undefined>
): Promise<BulkGetDictionaryResult>

export async function bulkGetDictionary<DocSchema extends StandardSchemaV1>(
  config: CouchConfigInput,
  ids: Array<string | undefined>,
  options: Omit<BulkGetDictionaryOptions<DocSchema>, 'includeDocs'>
): Promise<BulkGetDictionaryResult<DocSchema>>

/**
 * Bulk get documents by IDs and return a dictionary of found and not found documents.
 *
 * @template DocSchema - Schema used to validate each returned document, if provided. Note: if a document is found and it fails validation this will throw a Error<StandardSchemaV1.FailureResult["issues"]>.
 *
 * @param config - CouchDB configuration data that is validated before use.
 * @param ids - Array of document IDs to retrieve.
 * @param options - Options for bulk get operation, including validation schema.
 *
 * @returns An object containing found documents and not found rows.
 *
 * @throws {RetryableError} When a retryable HTTP status code is encountered or no response is received.
 * @throws {Error<StandardSchemaV1.FailureResult["issues"]>} When the configuration or validation schemas fail to parse.
 * @throws {Error} When CouchDB returns a non-retryable error payload.
 */
export async function bulkGetDictionary<DocSchema extends StandardSchemaV1>(
  config: CouchConfigInput,
  ids: Array<string | undefined>,
  options?: Omit<BulkGetDictionaryOptions<DocSchema>, 'includeDocs'>
) {
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
  (ids: string[]): Promise<BulkGetDictionaryResult>
  <DocSchema extends StandardSchemaV1 = typeof CouchDoc>(
    ids: string[],
    options: BulkGetOptions<DocSchema>
  ): Promise<BulkGetDictionaryResult<DocSchema>>
}
