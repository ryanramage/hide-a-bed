import { z } from 'zod'
import { CouchConfig } from './config.mjs'
import { CouchDocResponse } from './crud.mjs'

export const PatchProperties = z.record(z.string(), z.any())
export const StrictPatchProperties = z.object({
  _rev: z.string()
}).and(PatchProperties)

export const Patch = z.function()
  .args(
    CouchConfig,
    z.string().describe('the couch doc id'),
    StrictPatchProperties
  )
  .returns(z.promise(CouchDocResponse))
/** @typedef { z.infer<typeof Patch> } PatchSchema */

export const PatchBound = z.function()
  .args(
    z.string().describe('the couch doc id'),
    StrictPatchProperties
  )
  .returns(z.promise(CouchDocResponse))
/** @typedef { z.infer<typeof PatchBound> } PatchBoundSchema */

export const PatchDangerously = z.function()
  .args(
    CouchConfig,
    z.string().describe('the couch doc id'),
    PatchProperties
  )
  .returns(z.promise(CouchDocResponse))
/** @typedef { z.infer<typeof PatchDangerously> } PatchDangerouslySchema */

export const PatchDangerouslyBound = z.function()
  .args(
    z.string().describe('the couch doc id'),
    PatchProperties
  )
  .returns(z.promise(CouchDocResponse))
/** @typedef { z.infer<typeof PatchDangerouslyBound> } PatchDangerouslyBoundSchema */
