import needle from 'needle'
import { z } from 'zod'
import type { CouchConfigInput } from '../schema/config.mts'
import { createLogger } from './utils/logger.mts'
import { mergeNeedleOpts } from './utils/mergeNeedleOpts.mts'
import { RetryableError, NotFoundError } from './utils/errors.mts'
import type { StandardSchemaV1 } from '../types/standard-schema.ts'
import { CouchDoc } from '../schema/couch/couch.output.schema.ts'

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

export const CouchGetOptions = z.object({
  rev: z.string().optional().describe('the couch doc revision'),
  validate: z
    .object({
      docSchema: ValidSchema.optional()
    })
    .optional()
    .describe('optional document validation rules')
})

async function _getWithOptions<DocSchema extends StandardSchemaV1>(
  config: CouchConfigInput,
  id: string,
  options: InternalGetOptions<DocSchema>
): Promise<StandardSchemaV1.InferOutput<DocSchema> | null> {
  const parsedOptions = CouchGetOptions.parse({
    rev: options.rev,
    validate: options.validate
  })

  const logger = createLogger(config)
  const rev = parsedOptions.rev
  const path = rev ? `${id}?rev=${rev}` : id
  const url = `${config.couch}/${path}`

  const httpOptions = {
    json: true,
    headers: {
      'Content-Type': 'application/json'
    }
  }

  const requestOptions = mergeNeedleOpts(config, httpOptions)
  logger.info(`Getting document with id: ${id}, rev ${rev ?? 'latest'}`)

  try {
    const resp = await needle('get', url, null, requestOptions)
    if (!resp) {
      logger.error('No response received from get request')
      throw new RetryableError('no response', 503)
    }

    const body = resp.body ?? null

    if (resp.statusCode === 404) {
      if (config.throwOnGetNotFound) {
        const reason = typeof body?.reason === 'string' ? body.reason : 'not_found'
        logger.warn(`Document not found (throwing error): ${id}, rev ${rev ?? 'latest'}`)
        throw new NotFoundError(id, reason)
      }

      logger.debug(`Document not found (returning undefined): ${id}, rev ${rev ?? 'latest'}`)
      return null
    }

    if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
      const reason = typeof body?.reason === 'string' ? body.reason : 'retryable error'
      logger.warn(`Retryable status code received: ${resp.statusCode}`)
      throw new RetryableError(reason, resp.statusCode)
    }

    if (resp.statusCode !== 200) {
      const reason = typeof body?.reason === 'string' ? body.reason : 'failed'
      logger.error(`Unexpected status code: ${resp.statusCode}`)
      throw new Error(reason)
    }

    const docSchema = (parsedOptions.validate?.docSchema ?? CouchDoc) as DocSchema
    const typedDoc = await docSchema['~standard'].validate(body)

    if (typedDoc.issues) {
      throw typedDoc.issues
    }

    logger.info(`Successfully retrieved document: ${id}, rev ${rev ?? 'latest'}`)
    return typedDoc.value
  } catch (err) {
    logger.error('Error during get operation:', err)
    RetryableError.handleNetworkError(err)
  }
}

export async function get(
  config: CouchConfigInput,
  id: string
): Promise<z.output<typeof CouchDoc> | null>

export async function get<DocSchema extends StandardSchemaV1>(
  config: CouchConfigInput,
  id: string,
  options: GetOptions<DocSchema>
): Promise<StandardSchemaV1.InferOutput<DocSchema> | null>

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

export async function getAtRev(
  config: CouchConfigInput,
  id: string,
  rev: string
): Promise<StandardSchemaV1.InferOutput<typeof CouchDoc> | null>

export async function getAtRev<DocSchema extends StandardSchemaV1>(
  config: CouchConfigInput,
  id: string,
  rev: string,
  options: GetOptions<DocSchema>
): Promise<StandardSchemaV1.InferOutput<DocSchema> | null>

export async function getAtRev<DocSchema extends StandardSchemaV1>(
  config: CouchConfigInput,
  id: string,
  rev: string,
  options?: GetOptions<DocSchema>
): Promise<StandardSchemaV1.InferOutput<DocSchema> | null> {
  return _getWithOptions<DocSchema>(config, id, { ...options, rev })
}

export type GetAtRevBound = <DocSchema extends StandardSchemaV1 = typeof CouchDoc>(
  id: string,
  rev: string,
  options?: GetOptions<DocSchema> | undefined
) => Promise<StandardSchemaV1.InferOutput<DocSchema> | null>
