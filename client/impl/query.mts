import needle, { type BodyData, type NeedleHttpVerbs } from 'needle'
import { createLogger } from './utils/logger.mts'

import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { z } from 'zod'
import { queryString } from './utils/queryString.mts'
import { mergeNeedleOpts } from './utils/mergeNeedleOpts.mts'
import { RetryableError } from './utils/errors.mts'
import { ViewOptions, type ViewString } from '../schema/couch/couch.input.schema.ts'
import type {
  ViewQueryResponse,
  ViewQueryResponseValidated
} from '../schema/couch/couch.output.schema.ts'
import type { StandardSchemaV1 } from '../types/standard-schema.ts'

export async function query(
  config: CouchConfigInput,
  view: ViewString,
  options?: ViewOptions
): Promise<ViewQueryResponse>

export async function query<
  DocSchema extends StandardSchemaV1,
  KeySchema extends StandardSchemaV1,
  ValueSchema extends StandardSchemaV1
>(
  config: CouchConfigInput,
  view: ViewString,
  options: ViewOptions & {
    validate?: {
      keySchema?: KeySchema
      valueSchema?: ValueSchema
    }
  }
): Promise<ViewQueryResponseValidated<DocSchema, KeySchema, ValueSchema>>

export async function query<
  DocSchema extends StandardSchemaV1,
  KeySchema extends StandardSchemaV1,
  ValueSchema extends StandardSchemaV1
>(
  config: CouchConfigInput,
  view: ViewString,
  options: ViewOptions & {
    include_docs: true
    validate?: {
      docSchema?: DocSchema
      keySchema?: KeySchema
      valueSchema?: ValueSchema
    }
  }
): Promise<ViewQueryResponseValidated<DocSchema, KeySchema, ValueSchema>>

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
 * @throws {Error} When CouchDB returns a non-retryable error payload.
 */
export async function query<
  DocSchema extends StandardSchemaV1,
  KeySchema extends StandardSchemaV1,
  ValueSchema extends StandardSchemaV1
>(
  _config: CouchConfigInput,
  view: ViewString,
  options: ViewOptions & {
    validate?: {
      docSchema?: DocSchema
      keySchema?: KeySchema
      valueSchema?: ValueSchema
    }
  } = {}
): Promise<ViewQueryResponseValidated<DocSchema, KeySchema, ValueSchema>> {
  const configParseResult = CouchConfig.safeParse(_config)
  const logger = createLogger(_config)
  logger.info(`Starting view query: ${view}`)
  logger.debug('Query options:', ViewOptions.parse(options || {}))
  if (!configParseResult.success) {
    logger.error(`Invalid configuration provided: ${z.prettifyError(configParseResult.error)}`)
    throw configParseResult.error
  }

  const config = configParseResult.data

  let qs = queryString(options)
  let method: NeedleHttpVerbs = 'get'
  let payload: BodyData = null

  const opts = {
    json: true,
    headers: {
      'Content-Type': 'application/json'
    }
  }

  const mergedOpts = mergeNeedleOpts(config, opts)

  // If keys are supplied, issue a POST to circumvent GET query string limits
  // see http://wiki.apache.org/couchdb/HTTP_view_API#Querying_Options
  if (typeof options.keys !== 'undefined') {
    const MAX_URL_LENGTH = 2000
    // according to http://stackoverflow.com/a/417184/680742,
    // the de facto URL length limit is 2000 characters

    const _options = structuredClone(options)
    delete _options.keys
    qs = queryString(_options)

    const keysAsString = `keys=${JSON.stringify(options.keys)}`

    if (keysAsString.length + qs.length + 1 <= MAX_URL_LENGTH) {
      // If the keys are short enough, do a GET. we do this to work around
      // Safari not understanding 304s on POSTs (see pouchdb/pouchdb#1239)
      method = 'get'
      if (qs.length > 0) qs += '&'
      else qs = ''
      qs += keysAsString
    } else {
      method = 'post'
      payload = { keys: options.keys }
    }
  }

  logger.debug('Generated query string:', qs)
  const url = `${config.couch}/${view}?${qs}`
  let results

  try {
    logger.debug(`Sending ${method} request to: ${url}`)
    results =
      method === 'get'
        ? await needle('get', url, mergedOpts)
        : await needle('post', url, payload, mergedOpts)
  } catch (err) {
    logger.error('Network error during query:', err)
    RetryableError.handleNetworkError(err)
  }

  if (!results) {
    logger.error('No response received from query request')
    throw new RetryableError('no response', 503)
  }

  const body = results.body

  if (RetryableError.isRetryableStatusCode(results.statusCode)) {
    logger.warn(`Retryable status code received: ${results.statusCode}`)
    throw new RetryableError(body.error || 'retryable error during query', results.statusCode)
  }

  if (body.error) {
    logger.error(`Query error: ${JSON.stringify(body)}`)
    throw new Error(`CouchDB query error: ${body.error} - ${body.reason || ''}`)
  }

  // If validation schemas are provided, validate each row accordingly
  if (options.validate) {
    const { docSchema, keySchema, valueSchema } = options.validate

    // TODO check validation logic and add same `onInvalidDoc` parameter from other impl.
    body.rows = z
      .array(
        z.looseObject({
          id: z.string(),
          key: keySchema ? keySchema : z.any(),
          value: valueSchema ? valueSchema : z.any(),
          doc: docSchema ? docSchema : z.any().optional()
        })
      )
      .parse(body.rows)
  }

  logger.info(`Successfully executed view query: ${view}`)
  logger.debug('Query response:', body)

  return body
}

export type QueryBound = {
  (view: ViewString, options?: ViewOptions): Promise<ViewQueryResponse>
  <
    DocSchema extends StandardSchemaV1,
    KeySchema extends StandardSchemaV1,
    ValueSchema extends StandardSchemaV1
  >(
    view: ViewString,
    options: ViewOptions & {
      include_docs: false
      validate?: {
        keySchema?: KeySchema
        valueSchema?: ValueSchema
      }
    }
  ): Promise<ViewQueryResponseValidated<DocSchema, KeySchema, ValueSchema>>
  <
    DocSchema extends StandardSchemaV1,
    KeySchema extends StandardSchemaV1,
    ValueSchema extends StandardSchemaV1
  >(
    view: ViewString,
    options: ViewOptions & {
      include_docs: true
      validate?: {
        docSchema?: DocSchema
        keySchema?: KeySchema
        valueSchema?: ValueSchema
      }
    }
  ): Promise<ViewQueryResponseValidated<DocSchema, KeySchema, ValueSchema>>
}
