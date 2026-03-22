import { z } from 'zod'
import { createLogger } from './utils/logger.mts'
import {
  RetryableError,
  NotFoundError,
  ValidationError,
  createResponseError
} from './utils/errors.mts'
import type { StandardSchemaV1 } from '../types/standard-schema.ts'
import { CouchDoc } from '../schema/couch/couch.output.schema.ts'
import { fetchCouchJson } from './utils/fetch.mts'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { isSuccessStatusCode } from './utils/response.mts'
import { createCouchDocUrl } from './utils/url.mts'

export type GetOptions<DocSchema extends StandardSchemaV1> = {
  validate?: {
    docSchema?: DocSchema
  }
}

type InternalGetOptions<DocSchema extends StandardSchemaV1> = GetOptions<DocSchema> & {
  rev?: string
}

const ValidSchema = z.custom(
  value => {
    return value !== null && typeof value === 'object' && '~standard' in value
  },
  {
    message: 'docSchema must be a valid StandardSchemaV1 schema'
  }
)

export const CouchGetOptions = z.strictObject({
  rev: z.string().optional().describe('the couch doc revision'),
  validate: z
    .object({
      docSchema: ValidSchema.optional()
    })
    .optional()
    .describe('optional document validation rules')
})

async function _getWithOptions<DocSchema extends StandardSchemaV1>(
  configInput: CouchConfigInput,
  id: string,
  options: InternalGetOptions<DocSchema>
): Promise<StandardSchemaV1.InferOutput<DocSchema> | null> {
  const config = CouchConfig.parse(configInput)
  const parsedOptions = CouchGetOptions.parse(options)

  const logger = createLogger(config)
  const rev = parsedOptions.rev
  const operation = rev ? 'getAtRev' : 'get'
  const url = createCouchDocUrl(id, config.couch)

  if (rev) {
    url.searchParams.set('rev', rev)
  }
  logger.info(`Getting document with id: ${id}, rev ${rev ?? 'latest'}`)

  try {
    const resp = await fetchCouchJson({
      auth: config.auth,
      method: 'GET',
      operation,
      request: config.request,
      url
    })
    if (!resp) {
      logger.error('No response received from get request')
      throw new RetryableError('Request failed', 503, { operation })
    }

    const body = resp.body ?? null

    if (resp.statusCode === 404) {
      logger.warn(`Document not found: ${id}, rev ${rev ?? 'latest'}`)
      if (config.throwOnGetNotFound === false) {
        return null
      }
      throw new NotFoundError(id, { operation, statusCode: resp.statusCode })
    }

    if (!isSuccessStatusCode('documentRead', resp.statusCode)) {
      logger.error(`Unexpected status code: ${resp.statusCode}`)
      throw createResponseError({
        body,
        defaultMessage: 'Failed to fetch document',
        docId: id,
        operation,
        statusCode: resp.statusCode
      })
    }

    const docSchema = (parsedOptions.validate?.docSchema ?? CouchDoc) as DocSchema
    const typedDoc = await docSchema['~standard'].validate(body)

    if (typedDoc.issues) {
      throw new ValidationError({
        docId: id,
        issues: typedDoc.issues,
        message: 'Document validation failed',
        operation
      })
    }

    logger.info(`Successfully retrieved document: ${id}, rev ${rev ?? 'latest'}`)
    return typedDoc.value
  } catch (err) {
    logger.error('Error during get operation:', err)
    RetryableError.handleNetworkError(err, operation)
  }
}

export async function get<DocSchema extends StandardSchemaV1 = typeof CouchDoc>(
  config: CouchConfigInput,
  id: string,
  options?: GetOptions<DocSchema>
): Promise<StandardSchemaV1.InferOutput<DocSchema> | null> {
  return _getWithOptions<DocSchema>(config, id, options ?? {})
}

export type GetBound = <DocSchema extends StandardSchemaV1 = typeof CouchDoc>(
  id: string,
  options?: GetOptions<DocSchema>
) => Promise<StandardSchemaV1.InferOutput<DocSchema> | null>

export async function getAtRev<DocSchema extends StandardSchemaV1>(
  config: CouchConfigInput,
  id: string,
  rev: string,
  options?: GetOptions<DocSchema>
): Promise<StandardSchemaV1.InferOutput<DocSchema> | null> {
  return _getWithOptions<DocSchema>(config, id, {
    ...options,
    rev
  })
}

export type GetAtRevBound = <DocSchema extends StandardSchemaV1 = typeof CouchDoc>(
  id: string,
  rev: string,
  options?: GetOptions<DocSchema> | undefined
) => Promise<StandardSchemaV1.InferOutput<DocSchema> | null>
