export class TransactionSetupError extends Error {
  details: Record<string, unknown>

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'TransactionSetupError'
    this.details = details
  }
}

export class TransactionVersionConflictError extends Error {
  conflictingIds: string[]

  constructor(conflictingIds: string[]) {
    super(`Revision mismatch for documents: ${conflictingIds.join(', ')}`)
    this.name = 'TransactionVersionConflictError'
    this.conflictingIds = conflictingIds
  }
}

export class TransactionBulkOperationError extends Error {
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
    super(`Failed to save documents: ${failedDocs.map(d => d.id).join(', ')}`)
    this.name = 'TransactionBulkOperationError'
    this.failedDocs = failedDocs
  }
}

export class TransactionRollbackError extends Error {
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
    super(message)
    this.name = 'TransactionRollbackError'
    this.originalError = originalError
    this.rollbackResults = rollbackResults
  }
}
