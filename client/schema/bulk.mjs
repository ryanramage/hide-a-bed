import { z } from 'zod'
import { CouchConfig } from './config.mjs'

export const BulkSaveResponseSchema = z.array(z.object({
  ok: z.boolean().nullish(),
  id: z.string(),
  rev: z.string().nullish(),
  error: z.string().nullish().describe('if an error occured, one word reason, eg conflict'),
  reason: z.string().nullish().describe('a full error message')
}))
/** @typedef { z.infer<typeof BulkSaveResponseSchema> } Response */

export const BulkSave = z.function().args(
  CouchConfig,
  z.array(z.object({
    _id: z.string()
  }).passthrough())
).returns(z.promise(BulkSaveResponseSchema))
/** @typedef { z.infer<typeof SaveSchema> } Save */

export const BulkGet = z.function().args(
  CouchConfig,
  z.array(z.string().describe('the ids to get'))
)
