import { z } from 'zod'
import type { StandardSchemaV1 } from '../../types/standard-schema.ts'

/**
 * Default schema for a returned CouchDB document if no validation schema is provided.
 */
export const CouchDoc = z.looseObject({
  _id: z.string().describe('the couch doc id'),
  _rev: z.string().optional().nullish().describe('the doc revision'),
  _deleted: z.boolean().optional().describe('is the doc deleted')
})
export type CouchDoc = StandardSchemaV1.InferOutput<typeof CouchDoc>

/**
 * A type for input CouchDB documents (without required _id).
 */
export type CouchDocInput = Omit<CouchDoc, '_id'> & { _id?: string }

/**
 * Default schema for a CouchDB view row if no validation schema is provided.
 */
export const ViewRow = z.object({
  id: z.string().optional(),
  key: z.any().nullish(),
  value: z.any().nullish(),
  doc: CouchDoc.nullish(),
  error: z.string().optional().describe('usually not_found, if something is wrong with this doc')
})
export type ViewRow = StandardSchemaV1.InferOutput<typeof ViewRow>

/**
 * A CouchDB view row with validated key, value, and document schemas.
 */
export type ViewRowValidated<
  DocSchema extends StandardSchemaV1,
  KeySchema extends StandardSchemaV1,
  ValueSchema extends StandardSchemaV1
> = {
  id?: string
  key?: StandardSchemaV1.InferOutput<KeySchema>
  value?: StandardSchemaV1.InferOutput<ValueSchema>
  doc?: StandardSchemaV1.InferOutput<DocSchema>
  error?: string
}

/**
 * Response type for a CouchDB view query if no validation schemas are provided.
 */
export const ViewQueryResponse = z.object({
  total_rows: z.number().nonnegative().optional().describe('total rows in the view'),
  offset: z
    .number()
    .nonnegative()
    .optional()
    .describe('the offset of the first row in this result set'),
  error: z.string().optional().describe('if something is wrong'),
  rows: z.array(ViewRow).optional().describe('the rows returned by the view'),
  update_seq: z
    .number()
    .optional()
    .describe('the update sequence of the database at the time of the query')
})
export type ViewQueryResponse = StandardSchemaV1.InferOutput<typeof ViewQueryResponse>

/**
 * Response type for a CouchDB view query with validated key, value, and document schemas.
 */
export type ViewQueryResponseValidated<
  DocSchema extends StandardSchemaV1,
  KeySchema extends StandardSchemaV1 = StandardSchemaV1<unknown>,
  ValueSchema extends StandardSchemaV1 = StandardSchemaV1<unknown>
> = Omit<ViewQueryResponse, 'rows'> & {
  rows: Array<ViewRowValidated<DocSchema, KeySchema, ValueSchema>>
}

/**
 * CouchDB _bulk_docs response schema
 */
export const BulkSaveResponse = z.array(
  z.object({
    ok: z.boolean().nullish(),
    id: z.string().nullish(),
    rev: z.string().nullish(),
    error: z.string().nullish().describe('if an error occurred, one word reason, eg conflict'),
    reason: z.string().nullish().describe('a full error message')
  })
)
export type BulkSaveResponse = z.infer<typeof BulkSaveResponse>

export const CouchPutResponse = z.object({
  ok: z.boolean().optional().describe('did the request succeed'),
  error: z.string().optional().describe('the error message, if did not succeed'),
  statusCode: z.number(),
  id: z.string().optional().describe('the couch doc id'),
  rev: z.string().optional().describe('the new rev of the doc')
})

export const CouchDBInfo = z.looseObject({
  cluster: z
    .object({
      n: z.number().describe('Replicas. The number of copies of every document.').optional(),
      q: z.number().describe('Shards. The number of range partitions.').optional(),
      r: z
        .number()
        .describe(
          'Read quorum. The number of consistent copies of a document that need to be read before a successful reply.'
        )
        .optional(),
      w: z
        .number()
        .describe(
          'Write quorum. The number of copies of a document that need to be written before a successful reply.'
        )
        .optional()
    })
    .optional(),
  compact_running: z
    .boolean()
    .describe('Set to true if the database compaction routine is operating on this database.')
    .optional(),
  db_name: z.string().describe('The name of the database.'),
  disk_format_version: z
    .number()
    .describe('The version of the physical format used for the data when it is stored on disk.')
    .optional(),
  doc_count: z.number().describe('A count of the documents in the specified database.').optional(),
  doc_del_count: z.number().describe('Number of deleted documents').optional(),
  instance_start_time: z.string().optional(),
  purge_seq: z
    .string()
    .describe(
      'An opaque string that describes the purge state of the database. Do not rely on this string for counting the number of purge operations.'
    )
    .optional(),
  sizes: z
    .object({
      active: z
        .number()
        .describe('The size of live data inside the database, in bytes.')
        .optional(),
      external: z
        .number()
        .describe('The uncompressed size of database contents in bytes.')
        .optional(),
      file: z
        .number()
        .describe(
          'The size of the database file on disk in bytes. Views indexes are not included in the calculation.'
        )
        .optional()
    })
    .optional(),
  update_seq: z
    .string()
    .or(z.number())
    .describe(
      'An opaque string that describes the state of the database. Do not rely on this string for counting the number of updates.'
    )
    .optional(),
  props: z
    .object({
      partitioned: z
        .boolean()
        .describe('If present and true, this indicates that the database is partitioned.')
        .optional()
    })
    .optional()
})
export type CouchDBInfo = z.infer<typeof CouchDBInfo>
