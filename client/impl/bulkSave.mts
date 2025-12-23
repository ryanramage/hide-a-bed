import needle from 'needle'
import { createLogger } from './utils/logger.mts'
import { mergeNeedleOpts } from './utils/mergeNeedleOpts.mts'
import { bulkGetDictionary } from './bulkGet.mts'
import { setupEmitter } from './utils/trackedEmitter.mts'
import {
  TransactionSetupError,
  TransactionVersionConflictError,
  TransactionBulkOperationError,
  TransactionRollbackError
} from './utils/transactionErrors.mts'
import {
  BulkSaveResponse,
  CouchDoc,
  type CouchDocInput
} from '../schema/couch/couch.output.schema.ts'
import type { CouchConfigInput } from '../schema/config.mts'
import { RetryableError } from './utils/errors.mts'
import { withRetry } from './retry.mts'
import { put } from './put.mts'

/**
 * Bulk saves documents to CouchDB using the _bulk_docs endpoint.
 *
 * @see
 * https://docs.couchdb.org/en/stable/api/database/bulk-api.html#db-bulk-docs
 *
 * @param {CouchConfigInput} config - The CouchDB configuration.
 * @param {CouchDocInput[]} docs - An array of documents to save.
 * @returns {Promise<BulkSaveResponse>} - The response from CouchDB after the bulk save operation.
 *
 * @throws {RetryableError} When a retryable HTTP status code is encountered or no response is received.
 * @throws {Error} When CouchDB returns a non-retryable error payload.
 */
export const bulkSave = async (config: CouchConfigInput, docs: CouchDocInput[]) => {
  const logger = createLogger(config)

  if (docs == null || !docs.length) {
    logger.error('bulkSave called with no docs')
    throw new Error('no docs provided')
  }

  logger.info(`Starting bulk save of ${docs.length} documents`)
  const url = `${config.couch}/_bulk_docs`
  const body = { docs }
  const opts = {
    json: true,
    headers: {
      'Content-Type': 'application/json'
    }
  }
  const mergedOpts = mergeNeedleOpts(config, opts)
  let resp
  try {
    resp = await needle('post', url, body, mergedOpts)
  } catch (err) {
    logger.error('Network error during bulk save:', err)
    RetryableError.handleNetworkError(err)
  }
  if (!resp) {
    logger.error('No response received from bulk save request')
    throw new RetryableError('no response', 503)
  }
  if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
    logger.warn(`Retryable status code received: ${resp.statusCode}`)
    throw new RetryableError('retryable error during bulk save', resp.statusCode)
  }
  if (resp.statusCode !== 201) {
    logger.error(`Unexpected status code: ${resp.statusCode}`)
    throw new Error('could not save')
  }
  const results = resp?.body || []
  return BulkSaveResponse.parse(results)
}

type TransactionStatus = 'pending' | 'completed' | 'rolled_back' | 'rollback_failed'
type TransactionDoc = {
  _id: string
  _rev: string | null | undefined
  type: 'transaction'
  status: TransactionStatus
  changes: CouchDocInput[]
  timestamp: string
}

/**
 * Performs a bulk save of documents within a transaction context.
 *
 * @remarks
 * This operation ensures that either all documents are saved successfully, or none are, maintaining data consistency.
 * If any document fails to save, the operation will attempt to roll back all changes.
 *
 * The transactionId has to be unique for the lifetime of the app. It is used to prevent two processes from executing the same transaction. It is up to you to craft a transactionId that uniquely represents this transaction, and that also is the same if another process tries to generate it.
 *
 * Exceptions to handle:
 *
 * `TransactionSetupError` Thrown if the transaction document cannot be created. Usually because it already exists
 * `TransactionVersionConflictError` Thrown if there are version conflicts with existing documents.
 * `TransactionBulkOperationError` Thrown if the bulk save operation fails for some documents.
 * `TransactionRollbackError` Thrown if the rollback operation fails after a transaction failure.
 *
 * @example
 * ```ts
 * const docsToSave = [
 *  { _id: 'doc1', foo: 'bar' },
 *  { _id: 'doc2', foo: 'baz' }
 * ];
 *
 * try {
 *  const results = await bulkSaveTransaction(config, 'unique-transaction-id', docsToSave);
 *  console.log('Bulk save successful:', results);
 *  } catch (error) {
 *  console.error('Bulk save transaction failed:', error);
 * }
 * ```
 *
 * @param {CouchConfigInput} config - The CouchDB configuration.
 * @param {string} transactionId - A unique identifier for the transaction.
 * @param {CouchDocInput[]} docs - An array of documents to save.
 * @returns {Promise<BulkSaveResponse>} - The transaction save results.
 * @throws {TransactionSetupError} When the transaction document cannot be created.
 * @throws {TransactionVersionConflictError} When there are version conflicts with existing documents.
 * @throws {TransactionBulkOperationError} When the bulk save operation fails for some documents.
 * @throws {TransactionRollbackError} When the rollback operation fails after a transaction failure.
 */
export const bulkSaveTransaction = async (
  config: CouchConfigInput,
  transactionId: string,
  docs: CouchDocInput[]
): Promise<BulkSaveResponse> => {
  const emitter = setupEmitter(config)
  const logger = createLogger(config)
  const retryOptions = {
    maxRetries: config.maxRetries ?? 10,
    initialDelay: config.initialDelay ?? 1000,
    backoffFactor: config.backoffFactor ?? 2
  }
  const _put = config.bindWithRetry
    ? withRetry(put.bind(null, config), retryOptions)
    : put.bind(null, config)
  logger.info(`Starting bulk save transaction ${transactionId} for ${docs.length} documents`)

  // Create transaction document
  const transactionDoc: TransactionDoc = {
    _id: `txn:${transactionId}`,
    _rev: null,
    type: 'transaction',
    status: 'pending',
    changes: docs,
    timestamp: new Date().toISOString()
  }

  // Save transaction document
  let transactionResponse = await _put(transactionDoc)
  logger.debug('Transaction document created:', transactionDoc, transactionResponse)
  await emitter.emit('transaction-created', {
    transactionResponse,
    txnDoc: transactionDoc
  })
  if (transactionResponse.error) {
    throw new TransactionSetupError('Failed to create transaction document', {
      error: transactionResponse.error,
      response: transactionResponse
    })
  }

  // Get current revisions of all documents
  const existingDocs = await bulkGetDictionary(
    config,
    docs.map(d => d._id)
  )
  logger.debug('Fetched current revisions of documents:', existingDocs)
  await emitter.emit('transaction-revs-fetched', existingDocs)

  /** @type {string[]} */
  const revErrors: string[] = []
  // if any of the existingDocs, and the docs provided do not match on rev, then throw an error
  docs.forEach(d => {
    if (!d._id) return
    if (existingDocs.found[d._id] && existingDocs.found[d._id]._rev !== d._rev)
      revErrors.push(d._id)
    if (existingDocs.notFound[d._id] && d._rev) revErrors.push(d._id)
  })

  if (revErrors.length > 0) {
    throw new TransactionVersionConflictError(revErrors)
  }
  logger.debug('Checked document revisions:', existingDocs)
  await emitter.emit('transaction-revs-checked', existingDocs)

  const providedDocsById: Record<string, CouchDocInput> = {}
  docs.forEach(d => {
    if (!d._id) return
    providedDocsById[d._id] = d
  })

  const newDocsToRollback: BulkSaveResponse = []
  const potentialExistingDocsToRollback: BulkSaveResponse = []
  const failedDocs: BulkSaveResponse = []

  try {
    logger.info('Transaction started:', transactionDoc)
    await emitter.emit('transaction-started', transactionDoc)
    // Apply updates
    const results = await bulkSave(config, docs)
    logger.info('Transaction updates applied:', results)
    await emitter.emit('transaction-updates-applied', results)

    // Check for failures
    results.forEach(r => {
      if (!r.id) return // not enough info
      if (!r.error) {
        if (existingDocs.notFound[r.id]) newDocsToRollback.push(r)
        if (existingDocs.found[r.id]) potentialExistingDocsToRollback.push(r)
      } else {
        failedDocs.push(r)
      }
    })
    if (failedDocs.length > 0) {
      throw new TransactionBulkOperationError(failedDocs)
    }

    // Update transaction status to completed
    transactionDoc.status = 'completed'
    transactionDoc._rev = transactionResponse.rev
    transactionResponse = await _put(transactionDoc)
    logger.info('Transaction completed:', transactionDoc)
    await emitter.emit('transaction-completed', {
      transactionResponse,
      transactionDoc
    })
    if (transactionResponse.statusCode !== 201) {
      logger.error('Failed to update transaction status to completed')
    }

    return results
  } catch (error) {
    logger.error('Transaction failed, attempting rollback:', error)

    // Rollback changes
    const toRollback: CouchDoc[] = []
    potentialExistingDocsToRollback.forEach(row => {
      if (!row.id || !row.rev) return
      const doc = existingDocs.found[row.id]
      doc._rev = row.rev
      toRollback.push(doc)
    })
    newDocsToRollback.forEach(d => {
      if (!d.id || !d.rev) return
      const before = JSON.parse(JSON.stringify(providedDocsById[d.id]))
      before._rev = d.rev
      before._deleted = true
      toRollback.push(before)
    })

    // rollback all the changes
    const bulkRollbackResult = await bulkSave(config, toRollback)
    let status: TransactionStatus = 'rolled_back'
    bulkRollbackResult.forEach(r => {
      if (r.error) status = 'rollback_failed'
    })
    logger.warn('Transaction rolled back:', { bulkRollbackResult, status })
    await emitter.emit('transaction-rolled-back', {
      bulkRollbackResult,
      status
    })

    // Update transaction status to rolled back
    transactionDoc.status = status
    transactionDoc._rev = transactionResponse.rev || null
    transactionResponse = await _put(transactionDoc)
    logger.warn('Transaction rollback status updated:', transactionDoc)
    await emitter.emit('transaction-rolled-back-status', {
      transactionResponse,
      transactionDoc
    })
    if (transactionResponse.statusCode !== 201) {
      logger.error('Failed to update transaction status to rolled_back')
    }
    throw new TransactionRollbackError(
      'Transaction failed and rollback was unsuccessful',
      error as Error,
      bulkRollbackResult
    )
  }
}
