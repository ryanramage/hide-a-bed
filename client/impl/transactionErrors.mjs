export class TransactionSetupError extends Error {
  /**
   * @param {string} message
   * @param {Record<string, any>} details
   */
  constructor (message, details = {}) {
    super(message)
    this.name = 'TransactionSetupError'
    this.details = details
  }
}

export class TransactionVersionConflictError extends Error {
  /**
   * @param {string[]} conflictingIds
   */
  constructor (conflictingIds) {
    super(`Revision mismatch for documents: ${conflictingIds.join(', ')}`)
    this.name = 'TransactionVersionConflictError'
    this.conflictingIds = conflictingIds
  }
}

export class TransactionBulkOperationError extends Error {
  /**
   * @param {Array<{ok?: boolean|null, id?: string|null, rev?: string|null, error?: string|null, reason?: string|null}>} failedDocs
   */
  constructor (failedDocs) {
    super(`Failed to save documents: ${failedDocs.map(d => d.id).join(', ')}`)
    this.name = 'TransactionBulkOperationError'
    this.failedDocs = failedDocs
  }
}

export class TransactionRollbackError extends Error {
  /**
   * @param {string} message
   * @param {Error} originalError
   * @param {Array<{ok?: boolean|null, id?: string|null, rev?: string|null, error?: string|null, reason?: string|null}>} rollbackResults
   */
  constructor (message, originalError, rollbackResults) {
    super(message)
    this.name = 'TransactionRollbackError'
    this.originalError = originalError
    this.rollbackResults = rollbackResults
  }
}
