import { z } from 'zod'

const LoggerSchema = z.object({
  error: z.function().args(z.any()).returns(z.void()).optional(),
  warn: z.function().args(z.any()).returns(z.void()).optional(),
  info: z.function().args(z.any()).returns(z.void()).optional(),
  debug: z.function().args(z.any()).returns(z.void()).optional()
}).or(z.function().args(
  z.string(), // level
  z.any() // message/args
).returns(z.void()))

export const CouchConfig = z.object({
  throwOnGetNotFound: z.boolean().optional().default(false).describe('if a get is 404 should we throw or return undefined'),
  couch: z.string().describe('the url of the couch db'),
  bindWithRetry: z.boolean().optional().default(true).describe('should we bind with retry'),
  maxRetries: z.number().optional().default(3).describe('maximum number of retry attempts'),
  initialDelay: z.number().optional().default(1000).describe('initial retry delay in milliseconds'),
  backoffFactor: z.number().optional().default(2).describe('multiplier for exponential backoff'),
  useConsoleLogger: z.boolean().optional().default(false).describe('turn on console as a fallback logger'),
  logger: LoggerSchema.optional().describe('logging interface supporting winston-like or simple function interface'),
  _normalizedLogger: z.any().optional() // Internal property for caching normalized logger
}).passthrough().describe('The std config object')

/** @typedef { z.infer<typeof CouchConfig> } CouchConfigSchema */
