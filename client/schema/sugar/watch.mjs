import { z } from 'zod'
import { CouchConfig } from '../config.mjs'

export const WatchOptions = z.object({
  include_docs: z.boolean().default(false)
}).partial()

export const WatchDocs = z.function()
  .args(
    CouchConfig,
    z.union([z.string(), z.array(z.string())]),
    z.function().args(z.any()).returns(z.void()),
    WatchOptions
  )
  .returns(z.void())

/** @typedef { z.infer<typeof WatchOptions> } WatchOptionsSchema */
/** @typedef { z.infer<typeof WatchDocs> } WatchDocsSchema */

export const WatchDocsBound = z.function()
  .args(
    z.union([z.string(), z.array(z.string())]),
    z.function().args(z.any()).returns(z.void()),
    WatchOptions
  )
  .returns(z.void())

/** @typedef { z.infer<typeof WatchDocsBound> } WatchDocsBoundSchema */
