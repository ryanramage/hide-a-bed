import { z } from 'zod'
export const CouchConfig = z.object({
  couch: z.string().describe('the url of the couch db')
}).passthrough().describe('The std config object')
/** @typedef { z.infer<typeof CouchConfig> } CouchConfigSchema*/
