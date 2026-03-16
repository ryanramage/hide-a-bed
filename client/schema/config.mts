import { z } from 'zod'
import type { StandardSchemaV1 } from '../types/standard-schema.ts'
import { RequestOptions } from './request.mts'

const anyArgs = z.array(z.any())

const LoggerSchema = z
  .object({
    error: z.function({ input: anyArgs, output: z.void() }).optional(),
    warn: z.function({ input: anyArgs, output: z.void() }).optional(),
    info: z.function({ input: anyArgs, output: z.void() }).optional(),
    debug: z.function({ input: anyArgs, output: z.void() }).optional()
  })
  .or(z.function({ input: anyArgs, output: z.void() }))

export const CouchAuth = z.strictObject({
  username: z.string().describe('basic auth username for CouchDB requests'),
  password: z.string().describe('basic auth password for CouchDB requests')
})

const CouchUrl = z.custom<string | URL>(value => {
  try {
    const url = new URL(value as string | URL)
    return url.username === '' && url.password === ''
  } catch {
    return false
  }
})

export const CouchConfig = z
  .strictObject({
    auth: CouchAuth.optional().describe('basic auth credentials for CouchDB requests'),
    backoffFactor: z.number().optional().default(2).describe('multiplier for exponential backoff'),
    bindWithRetry: z.boolean().optional().default(true).describe('should we bind with retry'),
    couch: CouchUrl.describe('URL of the couch db without embedded credentials'),
    initialDelay: z
      .number()
      .optional()
      .default(1000)
      .describe('initial retry delay in milliseconds'),
    logger: LoggerSchema.optional().describe(
      'logging interface supporting winston-like or simple function interface'
    ),
    maxRetries: z.number().optional().default(3).describe('maximum number of retry attempts'),
    request: RequestOptions.optional().describe('default request controls for CouchDB requests'),
    throwOnGetNotFound: z
      .boolean()
      .optional()
      .default(false)
      .describe('if true, get() throws NotFoundError on 404; otherwise it returns null'),
    useConsoleLogger: z
      .boolean()
      .optional()
      .default(false)
      .describe('turn on console as a fallback logger'),
    '~emitter': z.any().optional().describe('emitter for events'),
    '~normalizedLogger': z.any().optional() // Internal property for caching normalized logger
  })
  .describe('The std config object')

export type CouchAuth = StandardSchemaV1.InferOutput<typeof CouchAuth>
export type CouchAuthInput = StandardSchemaV1.InferInput<typeof CouchAuth>
export type CouchConfig = StandardSchemaV1.InferOutput<typeof CouchConfig>
export type CouchConfigInput = StandardSchemaV1.InferInput<typeof CouchConfig>
