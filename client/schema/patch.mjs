import { z } from 'zod'
import { CouchConfig } from './config.mjs'
import { CouchDocResponse } from './crud.mjs'

export const PatchConfig = CouchConfig.extend({
  retries: z.number().min(0).max(100).optional(),
  delay: z.number().min(0).optional()
})

export const PatchProperties = z.record(z.string(), z.any())

export const Patch = z.function()
  .args(
    PatchConfig,
    z.string().describe('the couch doc id'),
    PatchProperties
  )
  .returns(z.promise(CouchDocResponse))
