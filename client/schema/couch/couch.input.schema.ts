import z from 'zod'
import type { StandardSchemaV1 } from '../../types/standard-schema.ts'

export type ViewString = '_all_docs' | `_design/${string}/_view/${string}`

export const ViewOptions = z
  .object({
    descending: z.boolean().optional().describe('sort results descending'),
    endkey_docid: z
      .string()
      .optional()
      .describe('stop returning records when this document ID is reached'),
    endkey: z.any().optional(),
    group_level: z.number().positive().optional().describe('group the results at this level'),
    group: z.boolean().optional().describe('group the results'),
    include_docs: z.boolean().optional().describe('join the id to the doc and return it'),
    inclusive_end: z
      .boolean()
      .optional()
      .describe('whether the endkey is included in the result, default true'),
    key: z.any().optional(),
    keys: z.array(z.any()).optional(),
    limit: z.number().nonnegative().optional().describe('limit the results to this many rows'),
    reduce: z.boolean().optional().describe('reduce the results'),
    skip: z.number().nonnegative().optional().describe('skip this many rows'),
    sorted: z.boolean().optional().describe('sort returned rows, default true'),
    stable: z
      .boolean()
      .optional()
      .describe('ensure the view index is not updated during the query, default false'),
    startkey: z.any().optional(),
    startkey_docid: z
      .string()
      .optional()
      .describe('start returning records when this document ID is reached'),
    update: z
      .enum(['true', 'false', 'lazy'])
      .optional()
      .describe('whether to update the view index before returning results, default true'),
    update_seq: z.boolean().optional().describe('include the update sequence in the result')
  })
  .describe('base options for a CouchDB view query')
export type ViewOptions = StandardSchemaV1.InferOutput<typeof ViewOptions>
