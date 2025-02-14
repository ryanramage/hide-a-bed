// @ts-check */
import { bulkGet, bulkSave, bulkRemove, bulkGetDictionary, bulkSaveTransaction } from './impl/bulk.mjs'
import { get, put, getAtRev } from './impl/crud.mjs'
import { changes } from './impl/changes.mjs'
import { patch, patchDangerously } from './impl/patch.mjs'
import { createLock, removeLock } from './impl/sugar/lock.mjs'
import { query } from './impl/query.mjs'
import { queryStream } from './impl/stream.mjs'
import { createQuery } from './impl/queryBuilder.mjs'
import { withRetry } from './impl/retry.mjs'
import { BulkSave, BulkGet, BulkRemove, BulkGetDictionary, BulkSaveTransaction } from './schema/bulk.mjs'
import { CouchConfig } from './schema/config.mjs'
import { SimpleViewQuery, SimpleViewQueryResponse } from './schema/query.mjs'
import { Changes, ChangesOptions, ChangesResponse } from './schema/changes.mjs'
import { SimpleViewQueryStream, OnRow } from './schema/stream.mjs'
import { Patch, PatchDangerously } from './schema/patch.mjs'
import { Lock, LockOptions, CreateLock, RemoveLock } from './schema/sugar/lock.mjs'
import { CouchDoc, CouchDocResponse, CouchPut, CouchGet, CouchGetAtRev } from './schema/crud.mjs'
import { Bind } from './schema/bind.mjs'

const schema = {
  CouchConfig,
  SimpleViewQuery,
  SimpleViewQueryResponse,
  SimpleViewQueryStream,
  OnRow,
  BulkSave,
  BulkGet,
  BulkRemove,
  BulkGetDictionary,
  BulkSaveTransaction,
  CouchGet,
  CouchPut,
  CouchDoc,
  CouchDocResponse,
  Patch,
  PatchDangerously,
  CouchGetAtRev,
  Bind,
  Lock,
  LockOptions,
  CreateLock,
  RemoveLock,
  Changes,
  ChangesOptions,
  ChangesResponse
}

/** @type { import('./schema/bind.mjs').BindSchema } */
const bindConfig = Bind.implement((
  /** @type { import('./schema/config.mjs').CouchConfigSchema } */
  config
) => {
  // Default retry options
  const retryOptions = {
    maxRetries: config.maxRetries ?? 10,
    initialDelay: config.initialDelay ?? 1000,
    backoffFactor: config.backoffFactor ?? 2
  }

  return {
    get: config.bindWithRetry ? withRetry(get.bind(null, config), retryOptions) : get.bind(null, config),
    getAtRev: config.bindWithRetry ? withRetry(getAtRev.bind(null, config), retryOptions) : getAtRev.bind(null, config),
    put: config.bindWithRetry ? withRetry(put.bind(null, config), retryOptions) : put.bind(null, config),
    bulkGet: config.bindWithRetry ? withRetry(bulkGet.bind(null, config), retryOptions) : bulkGet.bind(null, config),
    bulkSave: config.bindWithRetry ? withRetry(bulkSave.bind(null, config), retryOptions) : bulkSave.bind(null, config),
    query: config.bindWithRetry ? withRetry(query.bind(null, config), retryOptions) : query.bind(null, config),
    queryStream: config.bindWithRetry ? withRetry(queryStream.bind(null, config), retryOptions) : queryStream.bind(null, config),
    // Sugar Methods
    patch: config.bindWithRetry ? withRetry(patch.bind(null, config), retryOptions) : patch.bind(null, config),
    patchDangerously: patchDangerously.bind(null, config), // patchDangerously not included in retry
    bulkRemove: config.bindWithRetry ? withRetry(bulkRemove.bind(null, config), retryOptions) : bulkRemove.bind(null, config),
    bulkGetDictionary: config.bindWithRetry ? withRetry(bulkGetDictionary.bind(null, config), retryOptions) : bulkGetDictionary.bind(null, config),
    bulkSaveTransaction: bulkSaveTransaction.bind(null, config),
    createLock: createLock.bind(null, config),
    removeLock: removeLock.bind(null, config),
    changes: changes.bind(null, config)
  }
})

export {
  get,
  getAtRev,
  put,
  bulkGet,
  bulkSave,
  query,
  queryStream,
  schema,

  // sugar methods
  patch,
  patchDangerously,
  bulkRemove,
  bulkGetDictionary,
  bulkSaveTransaction,

  bindConfig,
  withRetry,
  createQuery,
  createLock,
  removeLock
}
