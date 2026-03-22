import type z from 'zod'
import type { BulkSaveFailureRow } from '../../schema/couch/couch.output.schema.ts'
import { OperationError } from './errors.mts'

type FailedDoc = z.infer<typeof BulkSaveFailureRow>

const getFailedDocLabel = (doc: FailedDoc) => {
  const id = doc.id ?? '<unknown id>'
  const detail = doc.reason ?? doc.error ?? 'unknown error'

  return `${id} (${detail})`
}

export class TransactionSetupError extends OperationError {
  details: Record<string, unknown>

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, { category: 'transaction' })
    this.name = 'TransactionSetupError'
    this.details = details
  }
}

export class TransactionVersionConflictError extends OperationError {
  conflictingIds: string[]

  constructor(conflictingIds: string[]) {
    super(`Revision mismatch for documents: ${conflictingIds.join(', ')}`, {
      category: 'transaction'
    })
    this.name = 'TransactionVersionConflictError'
    this.conflictingIds = conflictingIds
  }
}

export class TransactionBulkOperationError extends OperationError {
  failedDocs: FailedDoc[]

  constructor(failedDocs: FailedDoc[]) {
    super(
      `Failed to save ${failedDocs.length} document${failedDocs.length === 1 ? '' : 's'}: ${failedDocs.map(getFailedDocLabel).join(', ')}`,
      {
        category: 'transaction'
      }
    )
    this.name = 'TransactionBulkOperationError'
    this.failedDocs = failedDocs
  }
}

export class TransactionRollbackError extends OperationError {
  originalError: Error
  rollbackResults: FailedDoc[]

  constructor(message: string, originalError: Error, rollbackResults: FailedDoc[]) {
    super(message, { category: 'transaction' })
    this.name = 'TransactionRollbackError'
    this.originalError = originalError
    this.rollbackResults = rollbackResults
  }
}
