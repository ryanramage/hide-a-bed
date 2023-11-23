import { z } from 'zod'

// TODO - type this object
export const SaveResponseSchema = z.array(z.object({
  ok: z.boolean().nullish(),
  id: z.string(),
  rev: z.string().nullish(),
  error: z.string().nullish().describe('if an error occured, one word reason, eg conflict'),
  reason: z.string().nullish().describe('a full error message')
}))
/** @typedef { z.infer<typeof SaveResponseSchema> } Response */

export const BulkSave = z.function().args(
  z.object({
    couch: z.string().describe('the url to the couch database')
  }).passthrough().describe('config object'),
  z.array(z.object({
    _id: z.string()
  }).passthrough())
).returns(z.promise(SaveResponseSchema))
/** @typedef { z.infer<typeof SaveSchema> } Save */

export const BulkGet = z.function().args(
  z.object({
    couch: z.string().describe('the url to the couch database')
  }).passthrough().describe('config object'),
  z.array(z.string().describe('the ids to get'))
)
