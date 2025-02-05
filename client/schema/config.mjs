import { z } from 'zod'
export const CouchConfig = z.object({
  throwOnGetNotFound: z.boolean().describe('if a get is 404 should we throw or return undefined'),
  couch: z.string().describe('the url of the couch db'),
  maxRetries: z.number().optional().default(3).describe('maximum number of retry attempts'),
  initialDelay: z.number().optional().default(1000).describe('initial retry delay in milliseconds'),
  backoffFactor: z.number().optional().default(2).describe('multiplier for exponential backoff')
}).passthrough().describe('The std config object')
/** @typedef { z.infer<typeof CouchConfig> } CouchConfigSchema*/
