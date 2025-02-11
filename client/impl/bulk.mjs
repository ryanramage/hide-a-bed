// @ts-check
import needle from 'needle'
import { BulkSave, BulkGet, BulkRemove, BulkGetDictionary, BulkSaveTransaction } from '../schema/bulk.mjs'
import { RetryableError } from './errors.mjs'
import { createLogger } from './logger.mjs'
import { CouchDoc } from '../schema/crud.mjs'

const opts = {
  json: true,
  headers: {
    'Content-Type': 'application/json'
  }
}

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
  let resp
  try {
    resp = await needle('post', url, body, opts)
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
  let resp
  try {
    resp = await needle('post', url, payload, opts)
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
  return bulkSave(config, toRemove)
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
  const logger = createLogger(config)
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
  const url = `${config.couch}/${txnDoc._id}`
  let txnresp = await needle('put', url, txnDoc, opts)
  if (txnresp.statusCode !== 201) {
    throw new Error('Failed to create transaction document')
  }

  // Get current revisions of all documents
  const existingDocs = await bulkGetDictionary(config, docs.map(d => d._id))

  /** @type {string[]} */
  const revErrors = []
  // if any of the existingDocs, and the docs provided dont match on rev, then throw an error
  docs.forEach(d => {
    if (existingDocs.found[d._id] && existingDocs.found[d._id]._rev !== d._rev) revErrors.push(d._id)
  })

  if (revErrors.length > 0) {
    throw new Error(`Revision mismatch for documents: ${revErrors.join(', ')}`)
  }

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
    // Apply updates
    const results = await bulkSave(config, docs)

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
      throw new Error(`Failed to save documents: ${failedDocs.map(d => d.id).join(', ')}`)
    }

    // Update transaction status to completed
    txnDoc.status = 'completed'
    txnDoc._rev = txnresp.body.rev
    txnresp = await needle('put', url, txnDoc, opts)
    if (txnresp.statusCode !== 201) {
      logger.error('Failed to update transaction status to completed')
    }

    return results
  } catch (error) {
    logger.error('Transaction failed, attempting rollback', error)

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
      const before = structuredClone(providedDocsById[d.id])
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

    // Update transaction status to rolled back
    txnDoc.status = status
    txnDoc._rev = txnresp.body.rev
    txnresp = await needle('put', url, txnDoc, opts)
    if (txnresp.statusCode !== 201) {
      logger.error('Failed to update transaction status to rolled_back')
    }

    throw new Error('Transaction failed and was rolled back')
  }
})
