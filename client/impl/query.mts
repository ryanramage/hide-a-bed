import { createLogger } from './utils/logger.mts'

import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { z, ZodAny, ZodNever } from 'zod'
import { queryString } from './utils/queryString.mts'
import { RetryableError, createResponseError } from './utils/errors.mts'
import { ViewOptions, type ViewString } from '../schema/couch/couch.input.schema.ts'
import type { CouchDoc, ViewQueryResponseValidated } from '../schema/couch/couch.output.schema.ts'
import type { StandardSchemaV1 } from '../types/standard-schema.ts'
import { parseRows, type OnInvalidDocAction } from './utils/parseRows.mts'
import { fetchCouchJson } from './utils/fetch.mts'
import { isSuccessStatusCode } from './utils/response.mts'

type QueryBody = {
  error?: string
  reason?: string
  rows?: unknown[]
} & Record<string, unknown>

const ValidSchema = z.custom(
  value => {
    return value !== null && typeof value === 'object' && '~standard' in value
  },
  {
    message: 'schema must be a valid StandardSchemaV1 schema'
  }
)

const QueryValidationSchema = z
  .object({
    docSchema: ValidSchema.optional(),
    keySchema: ValidSchema.optional(),
    onInvalidDoc: z.enum(['skip', 'throw']).optional(),
    valueSchema: ValidSchema.optional()
  })
  .optional()

const QueryOptionsSchema = ViewOptions.extend({
  validate: QueryValidationSchema
}).strict()

type QueryRequestOptions<
  DocSchema extends StandardSchemaV1,
  KeySchema extends StandardSchemaV1,
  ValueSchema extends StandardSchemaV1
> = ViewOptions & {
  validate?: {
    onInvalidDoc?: OnInvalidDocAction
    docSchema?: DocSchema
    keySchema?: KeySchema
    valueSchema?: ValueSchema
  }
}

export async function query<
  DocSchema extends StandardSchemaV1 = typeof CouchDoc,
  KeySchema extends StandardSchemaV1 = ZodAny,
  ValueSchema extends StandardSchemaV1 = ZodAny
>(
  config: CouchConfigInput,
  view: ViewString,
  options: QueryRequestOptions<DocSchema, KeySchema, ValueSchema> & {
    include_docs: true
  }
): Promise<ViewQueryResponseValidated<DocSchema, KeySchema, ValueSchema>>

export async function query<
  DocSchema extends StandardSchemaV1 = ZodNever,
  KeySchema extends StandardSchemaV1 = ZodAny,
  ValueSchema extends StandardSchemaV1 = ZodAny
>(
  config: CouchConfigInput,
  view: ViewString,
  options: QueryRequestOptions<DocSchema, KeySchema, ValueSchema> & {
    include_docs?: false | undefined
  }
): Promise<ViewQueryResponseValidated<ZodNever, KeySchema, ValueSchema>>

export async function query(
  config: CouchConfigInput,
  view: ViewString,
  options?: ViewOptions
): Promise<ViewQueryResponseValidated<ZodNever, ZodAny, ZodAny>>

/**
 * Executes a CouchDB view query with optional schema validation and automatic handling
 * of HTTP method selection, query string construction, and retryable errors.
 *
 * @remarks
 * When using the validation feature, each row in the response will be validated against the provided
 * Types will be inferred from the StandardSchemaV1 supplied in the `options.validate` object.
 *
 * @template DocSchema - StandardSchemaV1 used to validate each returned `doc`, if provided.
 * @template KeySchema - StandardSchemaV1 used to validate each row `key`, if provided.
 * @template ValueSchema - StandardSchemaV1 used to validate each row `value`, if provided.
 *
 * @param _config - CouchDB configuration data that is validated before use.
 * @param view - Fully qualified design document and view identifier (e.g., `_design/foo/_view/bar`).
 * @param options - CouchDB view options, including optional validation schemas.
 *
 * @returns The parsed view response with rows validated against the supplied schemas.
 *
 * @throws {RetryableError} When a retryable HTTP status code is encountered or no response is received.
 * @throws {Error<Array<StandardSchemaV1.Issue>>} When the configuration or validation schemas fail to parse.
 * @throws {OperationError} When CouchDB returns a non-retryable response or malformed row payload.
 */
export async function query<
  DocSchema extends StandardSchemaV1,
  KeySchema extends StandardSchemaV1,
  ValueSchema extends StandardSchemaV1
>(
  _config: CouchConfigInput,
  view: ViewString,
  options: QueryRequestOptions<DocSchema, KeySchema, ValueSchema> = {}
): Promise<ViewQueryResponseValidated<DocSchema, KeySchema, ValueSchema>> {
  const configParseResult = CouchConfig.safeParse(_config)
  const parsedOptions = QueryOptionsSchema.parse(options || {})
  const logger = createLogger(_config)
  logger.info(`Starting view query: ${view}`)
  logger.debug('Query options:', parsedOptions)
  if (!configParseResult.success) {
    logger.error(`Invalid configuration provided: ${z.prettifyError(configParseResult.error)}`)
    throw configParseResult.error
  }

  const config = configParseResult.data

  let qs = queryString(parsedOptions)
  let method: 'GET' | 'POST' = 'GET'
  let payload: Record<string, unknown> | null = null

  // If keys are supplied, issue a POST to circumvent GET query string limits
  // see http://wiki.apache.org/couchdb/HTTP_view_API#Querying_Options
  if (typeof parsedOptions.keys !== 'undefined') {
    const MAX_URL_LENGTH = 2000
    // according to http://stackoverflow.com/a/417184/680742,
    // the de facto URL length limit is 2000 characters

    const { keys, validate, ...queryableOptions } = parsedOptions
    qs = queryString(queryableOptions)

    const keysAsString = `keys=${JSON.stringify(keys)}`

    if (keysAsString.length + qs.length + 1 <= MAX_URL_LENGTH) {
      // If the keys are short enough, do a GET. we do this to work around
      // Safari not understanding 304s on POSTs (see pouchdb/pouchdb#1239)
      method = 'GET'
      if (qs.length > 0) qs += '&'
      else qs = ''
      qs += keysAsString
    } else {
      method = 'POST'
      payload = { keys: parsedOptions.keys }
    }
  }

  logger.debug('Generated query string:', qs)
  const url = `${config.couch}/${view}?${qs}`
  let results

  try {
    logger.debug(`Sending ${method} request to: ${url}`)
    results = await fetchCouchJson<QueryBody>({
      auth: config.auth,
      method,
      operation: 'query',
      request: config.request,
      url,
      body: method === 'POST' ? payload : undefined
    })
  } catch (err) {
    logger.error('Network error during query:', err)
    RetryableError.handleNetworkError(err, 'query')
  }

  if (!results) {
    logger.error('No response received from query request')
    throw new RetryableError('Query failed', 503, { operation: 'query' })
  }

  const body = results.body

  if (!isSuccessStatusCode('viewQuery', results.statusCode) || body.error) {
    if (body.error) {
      logger.error(`Query error: ${JSON.stringify(body)}`)
    } else {
      logger.error(`Unexpected status code: ${results.statusCode}`)
    }

    throw createResponseError({
      body,
      defaultMessage: 'Query failed',
      operation: 'query',
      statusCode: results.statusCode
    })
  }

  // If validation schemas are provided, validate each row accordingly
  const rows: ViewQueryResponseValidated<DocSchema, KeySchema, ValueSchema>['rows'] =
    options.validate && body.rows
      ? await parseRows<DocSchema, KeySchema, ValueSchema>(body.rows, {
          ...options.validate,
          defaultMessage: 'Query failed',
          operation: 'query'
        })
      : ((body.rows ?? []) as ViewQueryResponseValidated<DocSchema, KeySchema, ValueSchema>['rows'])

  logger.info(`Successfully executed view query: ${view}`)
  logger.debug('Query response:', { ...body, rows })

  return {
    ...body,
    rows
  }
}

export type QueryBound = {
  <
    DocSchema extends StandardSchemaV1 = typeof CouchDoc,
    KeySchema extends StandardSchemaV1 = ZodAny,
    ValueSchema extends StandardSchemaV1 = ZodAny
  >(
    view: ViewString,
    options: QueryRequestOptions<DocSchema, KeySchema, ValueSchema> & {
      include_docs: true
    }
  ): Promise<ViewQueryResponseValidated<DocSchema, KeySchema, ValueSchema>>
  <
    DocSchema extends StandardSchemaV1 = ZodNever,
    KeySchema extends StandardSchemaV1 = ZodAny,
    ValueSchema extends StandardSchemaV1 = ZodAny
  >(
    view: ViewString,
    options: QueryRequestOptions<DocSchema, KeySchema, ValueSchema> & {
      include_docs?: false | undefined
    }
  ): Promise<ViewQueryResponseValidated<ZodNever, KeySchema, ValueSchema>>
  (
    view: ViewString,
    options?: ViewOptions
  ): Promise<ViewQueryResponseValidated<ZodNever, ZodAny, ZodAny>>
}
