import { z } from 'zod'
import type { StandardSchemaV1 } from '../../types/standard-schema.ts'

export const WatchOptions = z
  .object({
    include_docs: z.boolean().default(false),
    maxRetries: z.number().describe('maximum number of retries before giving up'),
    initialDelay: z.number().describe('initial delay between retries in milliseconds'),
    maxDelay: z.number().describe('maximum delay between retries in milliseconds')
  })
  .partial()

export type WatchOptions = StandardSchemaV1.InferOutput<typeof WatchOptions>
export type WatchOptionsInput = StandardSchemaV1.InferInput<typeof WatchOptions>
