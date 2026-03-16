import { OperationError } from './errors.mts'

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
  failedDocs: {
    ok?: boolean | null
    id?: string | null
    rev?: string | null
    error?: string | null
    reason?: string | null
  }[]

  constructor(
    failedDocs: Array<{
      ok?: boolean | null
      id?: string | null
      rev?: string | null
      error?: string | null
      reason?: string | null
    }>
  ) {
    super(`Failed to save documents: ${failedDocs.map(d => d.id).join(', ')}`, {
      category: 'transaction'
    })
    this.name = 'TransactionBulkOperationError'
    this.failedDocs = failedDocs
  }
}

export class TransactionRollbackError extends OperationError {
  originalError: Error
  rollbackResults: {
    ok?: boolean | null
    id?: string | null
    rev?: string | null
    error?: string | null
    reason?: string | null
  }[]

  constructor(
    message: string,
    originalError: Error,
    rollbackResults: Array<{
      ok?: boolean | null
      id?: string | null
      rev?: string | null
      error?: string | null
      reason?: string | null
    }>
  ) {
    super(message, { category: 'transaction' })
    this.name = 'TransactionRollbackError'
    this.originalError = originalError
    this.rollbackResults = rollbackResults
  }
}
