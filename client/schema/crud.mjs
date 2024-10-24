import { z } from 'zod'
import { CouchConfig } from './config.mjs'

export const CouchDoc = z.object({
  _id: z.string().describe('the couch doc id'),
  _rev: z.string().optional().describe('the doc revision')
}).passthrough()

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

export const CouchGet = z.function().args(
  CouchConfig,
  z.string().describe('the couch doc id')
).returns(z.promise(CouchDoc.nullable()))
