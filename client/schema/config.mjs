import { z } from 'zod'
export const CouchConfig = z.object({
  throwOnGetNotFound: z.boolean().describe('if a get is 404 should we throw or return undefined'),
  couch: z.string().describe('the url of the couch db')
}).passthrough().describe('The std config object')
/** @typedef { z.infer<typeof CouchConfig> } CouchConfigSchema*/
