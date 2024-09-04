import { z } from 'zod'
import { CouchConfig } from './config.mjs'

export const SimpleViewQueryResponse = z.object({
  error: z.string().optional().describe('if something is wrong'),
  rows: z.array(z.object({
    id: z.string().optional(),
    key: z.any().nullable(),
    value: z.any().nullable(),
    doc: z.object({}).passthrough().optional()
  }))
}).passthrough()


export const SimpleViewQuery = z.function().args(
  CouchConfig,
  z.string().describe('the view name'),
  z.object({
    startkey: z.any().optional(),
    endkey: z.any().optional(),
    descending: z.boolean().optional().describe('sort results descending'),
    skip: z.number().positive().optional().describe('skip this many rows'),
    limit: z.number().positive().optional().describe('limit the results to this many rows'),
    key: z.any().optional(),
    include_docs: z.boolean().optional().describe('join the id to the doc and return it'),
    reduce: z.boolean().optional().describe('reduce the results'),
    group: z.boolean().optional().describe('group the results'),
    group_level: z.number().positive().optional().describe('group the results at this level')
  }).optional().describe('query options')
).returns(z.promise(SimpleViewQueryResponse))
