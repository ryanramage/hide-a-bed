import { z } from 'zod'
import { CouchConfig } from '../config.mjs'
import { ChangesEmitter } from '../changes.mjs'

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
  .returns(ChangesEmitter)

/** @typedef { z.infer<typeof WatchOptions> } WatchOptionsSchema */
/** @typedef { z.infer<typeof WatchDocs> } WatchDocsSchema */

export const WatchDocsBound = z.function()
  .args(
    z.union([z.string(), z.array(z.string())]),
    z.function().args(z.any()).returns(z.void()),
    WatchOptions
  )
  .returns(ChangesEmitter)

/** @typedef { z.infer<typeof WatchDocsBound> } WatchDocsBoundSchema */
