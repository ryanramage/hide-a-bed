import { z } from 'zod'
import { CouchConfig } from './config.mjs'

export const CouchDoc = z.object({
  _id: z.string().describe('the couch doc id'),
  _rev: z.string().optional().describe('the doc revision'),
  _deleted: z.boolean().optional().describe('is the doc deleted')
}).passthrough()
/** @typedef { z.infer<typeof CouchDoc> } CouchDocSchema */

export const CouchDocResponse = z.object({
  ok: z.boolean().optional().describe('did the request succeed'),
  error: z.string().optional().describe('the error message, if did not succed'),
  statusCode: z.number(),
  id: z.string().optional().describe('the couch doc id'),
  rev: z.string().optional().describe('the new rev of the doc')
})

export const CouchPut = z.function().args(
  CouchConfig,
  CouchDoc
).returns(z.promise(CouchDocResponse))
/** @typedef { z.infer<typeof CouchPut> } CouchPutSchema */

export const CouchPutBound = z.function().args(
  CouchDoc
).returns(z.promise(CouchDocResponse))
/** @typedef { z.infer<typeof CouchPutBound> } CouchPutBoundSchema */

export const CouchGet = z.function().args(
  CouchConfig,
  z.string().describe('the couch doc id')
).returns(z.promise(CouchDoc.nullable()))
/** @typedef { z.infer<typeof CouchGet> } CouchGetSchema */

export const CouchGetBound = z.function().args(
  z.string().describe('the couch doc id')
).returns(z.promise(CouchDoc.nullable()))
/** @typedef { z.infer<typeof CouchGetBound> } CouchBoundSchema */

export const CouchGetAtRev = z.function().args(
  CouchConfig,
  z.string().describe('the couch doc id'),
  z.string().describe('the rev')
).returns(z.promise(CouchDoc.nullable()))
/** @typedef { z.infer<typeof CouchGetAtRev> } CouchGetAtRevSchema */

export const CouchGetAtRevBound = z.function().args(
  z.string().describe('the couch doc id'),
  z.string().describe('the rev')
).returns(z.promise(CouchDoc.nullable()))
/** @typedef { z.infer<typeof CouchGetAtRevBound> } CouchGetAtRevBoundSchema */

export const CouchGetOptions = z.object({
  rev: z.string().optional().describe('the couch doc revision')
})

export const CouchGetWithOptions = z.function().args(
  CouchConfig,
  z.string().describe('the couch doc id'),
  CouchGetOptions
).returns(z.promise(CouchDoc.nullable()))
/** @typedef { z.infer<typeof CouchGetWithOptions> } CouchGetWithOptionsSchema */
