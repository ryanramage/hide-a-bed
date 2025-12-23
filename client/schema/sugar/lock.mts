import { z } from 'zod'
import { CouchDoc } from '../couch/couch.output.schema.ts'
import type { StandardSchemaV1 } from '../../types/standard-schema.ts'

export const LockDoc = CouchDoc.extend({
  type: z.literal('lock'),
  locks: z.string().describe('the document ID being locked'),
  lockedAt: z.string().describe('ISO timestamp when lock was created'),
  lockedBy: z.string().describe('username of who created the lock')
})
export type LockDoc = StandardSchemaV1.InferOutput<typeof LockDoc>

export const LockOptions = z.object({
  enableLocking: z.boolean().prefault(true).describe('whether locking is enabled'),
  username: z.string().describe('username to attribute locks to')
})
export type LockOptions = StandardSchemaV1.InferOutput<typeof LockOptions>
export type LockOptionsInput = StandardSchemaV1.InferInput<typeof LockOptions>
