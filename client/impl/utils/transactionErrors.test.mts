import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import {
  TransactionBulkOperationError,
  TransactionRollbackError,
  TransactionSetupError,
  TransactionVersionConflictError
} from './transactionErrors.mts'

suite('transactionErrors', () => {
  test('TransactionSetupError stores details and name', () => {
    const error = new TransactionSetupError('setup failed', { id: 'txn-1' })

    assert.strictEqual(error.name, 'TransactionSetupError')
    assert.strictEqual(error.message, 'setup failed')
    assert.deepStrictEqual(error.details, { id: 'txn-1' })
  })

  test('TransactionVersionConflictError reports conflicting ids', () => {
    const error = new TransactionVersionConflictError(['doc-1', 'doc-2'])

    assert.strictEqual(error.name, 'TransactionVersionConflictError')
    assert.match(error.message, /doc-1, doc-2/)
    assert.deepStrictEqual(error.conflictingIds, ['doc-1', 'doc-2'])
  })

  test('TransactionBulkOperationError stores failed docs', () => {
    const failedDocs = [
      { id: 'doc-1', error: 'conflict', reason: 'stale revision' },
      { id: 'doc-2', error: 'forbidden', reason: 'validation failed' }
    ]

    const error = new TransactionBulkOperationError(failedDocs)

    assert.strictEqual(error.name, 'TransactionBulkOperationError')
    assert.match(error.message, /doc-1, doc-2/)
    assert.deepStrictEqual(error.failedDocs, failedDocs)
  })

  test('TransactionRollbackError stores original error and rollback results', () => {
    const originalError = new Error('save failed')
    const rollbackResults = [
      { id: 'doc-1', ok: true },
      { id: 'doc-2', error: 'conflict' }
    ]

    const error = new TransactionRollbackError(
      'rollback failed after save failure',
      originalError,
      rollbackResults
    )

    assert.strictEqual(error.name, 'TransactionRollbackError')
    assert.strictEqual(error.message, 'rollback failed after save failure')
    assert.strictEqual(error.originalError, originalError)
    assert.deepStrictEqual(error.rollbackResults, rollbackResults)
  })
})
