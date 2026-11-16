import { z } from 'zod'

/** Selector operators are interpreted by CouchDB, including nested selectors. */
export const MangoSelectorSchema = z.record(z.string(), z.unknown())

export const MangoSortSchema = z.array(
  z.union([z.string(), z.record(z.string(), z.enum(['asc', 'desc']))])
)

/** Native CouchDB _find options; supported fields depend on the server version. */
export const MangoQuerySchema = z
  .object({
    selector: MangoSelectorSchema,
    limit: z.number().int().positive().optional(),
    skip: z.number().int().nonnegative().optional(),
    sort: MangoSortSchema.optional(),
    fields: z.array(z.string()).optional(),
    use_index: z.union([z.string(), z.tuple([z.string(), z.string()])]).optional(),
    conflicts: z.boolean().optional(),
    r: z.number().int().positive().optional(),
    bookmark: z.string().optional(),
    update: z.boolean().optional(),
    stable: z.boolean().optional(),
    stale: z
      .union([z.literal('ok'), z.literal(false)])
      .optional()
      .describe('Deprecated CouchDB option; prefer stable and update'),
    execution_stats: z.boolean().optional(),
    allow_fallback: z.boolean().optional()
  })
  .strict()

export const MangoExecutionStatsSchema = z.looseObject({
  total_keys_examined: z.number(),
  total_docs_examined: z.number(),
  total_quorum_docs_examined: z.number(),
  results_returned: z.number(),
  execution_time_ms: z.number()
})

/** Opt into document validation by supplying the schema for your projection. */
export const createMangoResponseSchema = <DocSchema extends z.ZodType>(docSchema: DocSchema) =>
  z.looseObject({
    docs: z.array(docSchema),
    bookmark: z.string().optional(),
    warning: z.string().optional(),
    execution_stats: MangoExecutionStatsSchema.optional()
  })

export type MangoSelector = z.infer<typeof MangoSelectorSchema>
export type MangoSort = z.infer<typeof MangoSortSchema>
export type MangoQuery = z.infer<typeof MangoQuerySchema>
export type MangoExecutionStats = z.infer<typeof MangoExecutionStatsSchema>

// Projections may omit _id/_rev, so neither is imposed on the caller's document type.
export type MangoResponse<Doc = Record<string, unknown>> = {
  docs: Doc[]
  bookmark?: string
  warning?: string
  execution_stats?: MangoExecutionStats
}
