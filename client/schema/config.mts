import { z } from 'zod'
import type { StandardSchemaV1 } from '../types/standard-schema.ts'

const anyArgs = z.array(z.any())

const LoggerSchema = z
  .object({
    error: z.function({ input: anyArgs, output: z.void() }).optional(),
    warn: z.function({ input: anyArgs, output: z.void() }).optional(),
    info: z.function({ input: anyArgs, output: z.void() }).optional(),
    debug: z.function({ input: anyArgs, output: z.void() }).optional()
  })
  .or(z.function({ input: anyArgs, output: z.void() }))

export const NeedleBaseOptions = z.object({
  json: z.boolean(),
  headers: z.record(z.string(), z.string()),
  parse_response: z.boolean().optional()
})
export type NeedleBaseOptionsSchema = z.infer<typeof NeedleBaseOptions>

export const NeedleOptions = z.object({
  json: z.boolean().optional(),
  compressed: z.boolean().optional(),
  follow_max: z.number().optional(),
  follow_set_cookie: z.boolean().optional(),
  follow_set_referer: z.boolean().optional(),
  follow: z.number().optional(),
  timeout: z.number().optional(),
  read_timeout: z.number().optional(),
  parse_response: z.boolean().optional(),
  decode: z.boolean().optional(),
  parse_cookies: z.boolean().optional(),
  cookies: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  auth: z.enum(['auto', 'digest', 'basic']).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  proxy: z.string().optional(),
  agent: z.any().optional(),
  rejectUnauthorized: z.boolean().optional(),
  output: z.string().optional(),
  parse: z.boolean().optional(),
  multipart: z.boolean().optional(),
  open_timeout: z.number().optional(),
  response_timeout: z.number().optional(),
  keepAlive: z.boolean().optional()
})

export const CouchConfig = z
  .strictObject({
    backoffFactor: z.number().optional().default(2).describe('multiplier for exponential backoff'),
    bindWithRetry: z.boolean().optional().default(true).describe('should we bind with retry'),
    couch: z.string().describe('the url of the couch db'),
    initialDelay: z
      .number()
      .optional()
      .default(1000)
      .describe('initial retry delay in milliseconds'),
    logger: LoggerSchema.optional().describe(
      'logging interface supporting winston-like or simple function interface'
    ),
    maxRetries: z.number().optional().default(3).describe('maximum number of retry attempts'),
    needleOpts: NeedleOptions.optional(),
    throwOnGetNotFound: z
      .boolean()
      .optional()
      .default(false)
      .describe('if a get is 404 should we throw or return undefined'),
    useConsoleLogger: z
      .boolean()
      .optional()
      .default(false)
      .describe('turn on console as a fallback logger'),
    '~emitter': z.any().optional().describe('emitter for events'),
    '~normalizedLogger': z.any().optional() // Internal property for caching normalized logger
  })
  .describe('The std config object')

export type CouchConfig = StandardSchemaV1.InferOutput<typeof CouchConfig>
export type CouchConfigInput = StandardSchemaV1.InferInput<typeof CouchConfig>
