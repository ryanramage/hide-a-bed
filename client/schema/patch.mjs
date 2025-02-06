import { z } from 'zod'
import { CouchConfig } from './config.mjs'
import { CouchDocResponse } from './crud.mjs'

export const PatchProperties = z.record(z.string(), z.any())

export const Patch = z.function()
  .args(
    CouchConfig,
    z.string().describe('the couch doc id'),
    PatchProperties
  )
  .returns(z.promise(CouchDocResponse))
/** @typedef { z.infer<typeof Patch> } PatchSchema */

export const PatchBound = z.function()
  .args(
    z.string().describe('the couch doc id'),
    PatchProperties
  )
  .returns(z.promise(CouchDocResponse))
/** @typedef { z.infer<typeof PatchBound> } PatchBoundSchema */
