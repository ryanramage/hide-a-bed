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

const NeedleOptions = z.object({
  json: z.boolean().optional().default(true),
  compressed: z.boolean().optional().default(true),
  follow_max: z.number().optional(),
  follow_set_cookie: z.boolean().optional(),
  follow_set_referer: z.boolean().optional(),
  follow: z.number().optional(),
  timeout: z.number().optional(),
  read_timeout: z.number().optional(),
  parse_response: z.boolean().optional(),
  decode: z.boolean().optional(),
  parse_cookies: z.boolean().optional(),
  cookies: z.record(z.string()).optional(),
  headers: z.record(z.string()).optional().default({
    'Content-Type': 'application/json'
  }),
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

export const CouchConfig = z.object({
  throwOnGetNotFound: z.boolean().optional().default(false).describe('if a get is 404 should we throw or return undefined'),
  couch: z.string().describe('the url of the couch db'),
  bindWithRetry: z.boolean().optional().default(true).describe('should we bind with retry'),
  maxRetries: z.number().optional().default(3).describe('maximum number of retry attempts'),
  initialDelay: z.number().optional().default(1000).describe('initial retry delay in milliseconds'),
  backoffFactor: z.number().optional().default(2).describe('multiplier for exponential backoff'),
  useConsoleLogger: z.boolean().optional().default(false).describe('turn on console as a fallback logger'),
  logger: LoggerSchema.optional().describe('logging interface supporting winston-like or simple function interface'),
  // _emitter: z.any().optional().describe('emitter for events'),
  _normalizedLogger: z.any().optional(), // Internal property for caching normalized logger
  needle: NeedleOptions.optional().default({})
}).passthrough().describe('The std config object')

/** @typedef { z.infer<typeof CouchConfig> } CouchConfigSchema */
