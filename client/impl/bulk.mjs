// @ts-check
import needle from 'needle'
import { BulkSave, BulkGet, BulkRemove, BulkRemoveMap, BulkGetDictionary, BulkSaveTransaction } from '../schema/bulk.mjs'
import { withRetry } from './retry.mjs'
import { get, put } from './crud.mjs'
import { RetryableError } from './errors.mjs'
import { TransactionSetupError, TransactionVersionConflictError, TransactionBulkOperationError, TransactionRollbackError } from './transactionErrors.mjs'
import { createLogger } from './logger.mjs'
import { CouchDoc } from '../schema/crud.mjs'
import { setupEmitter } from './trackedEmitter.mjs'
import { mergeNeedleOpts } from './util.mjs'

/** @type { import('../schema/bulk.mjs').BulkSaveSchema } */
export const bulkSave = BulkSave.implement(async (config, docs) => {
  /** @type {import('./logger.mjs').Logger }  */
  const logger = createLogger(config)

  if (!docs) {
    logger.warn('bulkSave called with no docs')
    return { ok: false, error: 'noDocs', reason: 'no docs provided' }
  }
  if (!docs.length) {
    logger.warn('bulkSave called with empty docs array')
    return { ok: false, error: 'noDocs', reason: 'no docs provided' }
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
  return results
})

/** @type { import('../schema/bulk.mjs').BulkGetSchema } */
export const bulkGet = BulkGet.implement(async (config, ids) => {
  const logger = createLogger(config)
  const keys = ids

  logger.info(`Starting bulk get for ${keys.length} documents`)
  const url = `${config.couch}/_all_docs?include_docs=true`
  const payload = { keys }
  const opts = {
    json: true,
    headers: {
      'Content-Type': 'application/json'
    }
  }
  const mergedOpts = mergeNeedleOpts(config, opts)
  let resp
  try {
    resp = await needle('post', url, payload, mergedOpts)
  } catch (err) {
    logger.error('Network error during bulk get:', err)
    RetryableError.handleNetworkError(err)
  }
  if (!resp) {
    logger.error('No response received from bulk get request')
    throw new RetryableError('no response', 503)
  }
  if (RetryableError.isRetryableStatusCode(resp.statusCode)) {
    logger.warn(`Retryable status code received: ${resp.statusCode}`)
    throw new RetryableError('retryable error during bulk get', resp.statusCode)
  }
  if (resp.statusCode !== 200) {
    logger.error(`Unexpected status code: ${resp.statusCode}`)
    throw new Error('could not fetch')
  }
  /** @type { import('../schema/query.mjs').SimpleViewQueryResponseSchema } body */
  const body = resp.body
  return body
})

// sugar methods

/** @type { import('../schema/bulk.mjs').BulkRemoveSchema } */
export const bulkRemove = BulkRemove.implement(async (config, ids) => {
  const logger = createLogger(config)
  logger.info(`Starting bulk remove for ${ids.length} documents`)
  const resp = await bulkGet(config, ids)
  /** @type { Array<import('../schema/crud.mjs').CouchDocSchema> } toRemove */
  const toRemove = []
  resp.rows.forEach(row => {
    if (!row.doc) return
    try {
      const d = CouchDoc.parse(row.doc)
      d._deleted = true
      toRemove.push(d)
    } catch (e) {
      logger.warn(`Invalid document structure in bulk remove: ${row.id}`, e)
    }
  })
  if (!toRemove.length) return []
  const result = await bulkSave(config, toRemove)
  return result
})

/** @type { import('../schema/bulk.mjs').BulkRemoveMapSchema } */
export const bulkRemoveMap = BulkRemoveMap.implement(async (config, ids) => {
  const logger = createLogger(config)
  logger.info(`Starting bulk remove map for ${ids.length} documents`)
  const results = [];
  for (const id of ids) {
    const resp = await get(config, id)
    if (resp) {
      try {
        const d = CouchDoc.parse(resp)
        d._deleted = true
        const result = await put(config, d)
        results.push(result)
      } catch(e) {
        logger.warn(`Invalid document structure in bulk remove map: ${id}`, e)
      }
    }
  }
  return results
})

/** @type { import('../schema/bulk.mjs').BulkGetDictionarySchema } */
export const bulkGetDictionary = BulkGetDictionary.implement(async (config, ids) => {
  const resp = await bulkGet(config, ids)

  /** @type { import('../schema/bulk.mjs').BulkGetDictionaryResponseSchema } results */
  const results = { found: {}, notFound: {} }

  resp.rows.forEach(
    /** @param { import('../schema/query.mjs').ViewRowSchema } row */
    row => {
      if (!row.key) return
      if (row.error) {
        results.notFound[row.key] = row
        return
      }
      try {
      /** @type { import('../schema/crud.mjs').CouchDocSchema } doc */
        const doc = CouchDoc.parse(row.doc)
        results.found[doc._id] = doc
      } catch (e) {
        results.notFound[row.key] = row
      }
    })
  return results
})

/** @type { import('../schema/bulk.mjs').BulkSaveTransactionSchema } bulkSaveTransaction */
export const bulkSaveTransaction = BulkSaveTransaction.implement(async (config, transactionId, docs) => {
  const emitter = setupEmitter(config)
  const logger = createLogger(config)
  const retryOptions = {
    maxRetries: config.maxRetries ?? 10,
    initialDelay: config.initialDelay ?? 1000,
    backoffFactor: config.backoffFactor ?? 2
  }
  const _put = config.bindWithRetry ? withRetry(put.bind(null, config), retryOptions) : put.bind(null, config)
  logger.info(`Starting bulk save transaction ${transactionId} for ${docs.length} documents`)

  // Create transaction document
  const txnDoc = {
    _id: `txn:${transactionId}`,
    _rev: null,
    type: 'transaction',
    status: 'pending',
    changes: docs,
    timestamp: new Date().toISOString()
  }

  // Save transaction document
  let txnresp = await _put(txnDoc)
  logger.debug('Transaction document created:', txnDoc, txnresp)
  await emitter.emit('transaction-created', { txnresp, txnDoc })
  if (txnresp.error) {
    throw new TransactionSetupError('Failed to create transaction document', {
      error: txnresp.error,
      response: txnresp.body
    })
  }

  // Get current revisions of all documents
  const existingDocs = await bulkGetDictionary(config, docs.map(d => d._id))
  logger.debug('Fetched current revisions of documents:', existingDocs)
  await emitter.emit('transaction-revs-fetched', existingDocs)

  /** @type {string[]} */
  const revErrors = []
  // if any of the existingDocs, and the docs provided dont match on rev, then throw an error
  docs.forEach(d => {
    if (existingDocs.found[d._id] && existingDocs.found[d._id]._rev !== d._rev) revErrors.push(d._id)
    if (existingDocs.notFound[d._id] && d._rev) revErrors.push(d._id)
  })

  if (revErrors.length > 0) {
    throw new TransactionVersionConflictError(revErrors)
  }
  logger.debug('Checked document revisions:', existingDocs)
  await emitter.emit('transaction-revs-checked', existingDocs)

  /** @type {Record<string, import('../schema/crud.mjs').CouchDocSchema>} providedDocsById */
  const providedDocsById = {}
  docs.forEach((
    /** @type {import('../schema/crud.mjs').CouchDocSchema} */ d
  ) => {
    if (!d._id) return
    providedDocsById[d._id] = d
  })

  /** @type {import('../schema/bulk.mjs').Response} */
  const newDocsToRollback = []
  /** @type {import('../schema/bulk.mjs').Response} */
  const potentialExistingDocsToRollack = []
  /** @type {import('../schema/bulk.mjs').Response} */
  const failedDocs = []

  try {
    logger.info('Transaction started:', txnDoc)
    await emitter.emit('transaction-started', txnDoc)
    // Apply updates
    const results = await bulkSave(config, docs)
    logger.info('Transaction updates applied:', results)
    await emitter.emit('transaction-updates-applied', results)

    // Check for failures
    results.forEach(r => {
      if (!r.id) return // not enough info
      if (!r.error) {
        if (existingDocs.notFound[r.id]) newDocsToRollback.push(r)
        if (existingDocs.found[r.id]) potentialExistingDocsToRollack.push(r)
      } else {
        failedDocs.push(r)
      }
    })
    if (failedDocs.length > 0) {
      throw new TransactionBulkOperationError(failedDocs)
    }

    // Update transaction status to completed
    txnDoc.status = 'completed'
    txnDoc._rev = txnresp.rev
    txnresp = await _put(txnDoc)
    logger.info('Transaction completed:', txnDoc)
    await emitter.emit('transaction-completed', { txnresp, txnDoc })
    if (txnresp.statusCode !== 201) {
      logger.error('Failed to update transaction status to completed')
    }

    return results
  } catch (error) {
    logger.error('Transaction failed, attempting rollback:', error)

    // Rollback changes
    /** @type {Array<import('../schema/crud.mjs').CouchDocSchema>} */
    const toRollback = []
    potentialExistingDocsToRollack.forEach(row => {
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
    let status = 'rolled_back'
    bulkRollbackResult.forEach(r => {
      if (r.error) status = 'rollback_failed'
    })
    logger.warn('Transaction rolled back:', { bulkRollbackResult, status })
    await emitter.emit('transaction-rolled-back', { bulkRollbackResult, status })

    // Update transaction status to rolled back
    txnDoc.status = status
    txnDoc._rev = txnresp.rev
    txnresp = await _put(txnDoc)
    logger.warn('Transaction rollback status updated:', txnDoc)
    await emitter.emit('transaction-rolled-back-status', { txnresp, txnDoc })
    if (txnresp.statusCode !== 201) {
      logger.error('Failed to update transaction status to rolled_back')
    }
    throw new TransactionRollbackError(
      'Transaction failed and rollback was unsuccessful',
      /** @type {Error} */ (error),
      bulkRollbackResult
    )
  }
})
