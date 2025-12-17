// @ts-check */
import { z } from 'zod'
import { bulkGet, bulkSave, bulkRemove, bulkRemoveMap, bulkGetDictionary, bulkSaveTransaction } from './impl/bulk.mjs'
import { get, put, getAtRev, remove } from './impl/crud.mjs'
import { patch, patchDangerously } from './impl/patch.mjs'
import { createLock, removeLock } from './impl/sugar/lock.mjs'
import { watchDocs } from './impl/sugar/watch.mjs'
import { query } from './impl/query.mjs'
import { queryStream } from './impl/stream.mjs'
import { createQuery } from './impl/queryBuilder.mjs'
import { getDBInfo } from './impl/util.mjs'
import { withRetry } from './impl/retry.mjs'
import { BulkSave, BulkGet, BulkRemove, BulkRemoveMap, BulkGetDictionary, BulkSaveTransaction } from './schema/bulk.mjs'
import { CouchConfig } from './schema/config.mjs'
import { SimpleViewQuery, SimpleViewQueryResponse } from './schema/query.mjs'
import { SimpleViewQueryStream, OnRow } from './schema/stream.mjs'
import { Patch, PatchDangerously } from './schema/patch.mjs'
import { Lock, LockOptions, CreateLock, RemoveLock } from './schema/sugar/lock.mjs'
import { WatchDocs } from './schema/sugar/watch.mjs'
import { CouchDoc, CouchDocResponse, CouchPut, CouchGet, CouchGetAtRev, CouchRemove } from './schema/crud.mjs'
import { Bind, BindReturns } from './schema/bind.mjs'
import { GetDBInfo } from './schema/util.mjs'

const schema = {
  CouchConfig,
  SimpleViewQuery,
  SimpleViewQueryResponse,
  SimpleViewQueryStream,
  OnRow,
  BulkSave,
  BulkGet,
  BulkRemove,
  BulkRemoveMap,
  BulkGetDictionary,
  BulkSaveTransaction,
  CouchGet,
  CouchPut,
  CouchDoc,
  CouchDocResponse,
  Patch,
  PatchDangerously,
  CouchGetAtRev,
  CouchRemove,
  Bind,
  Lock,
  WatchDocs,
  LockOptions,
  CreateLock,
  RemoveLock,
  GetDBInfo
}
/**
  * @param {import('./schema/config.mjs').CouchConfigSchema } config
  */
function doBind (config) {
  // Default retry options
  const retryOptions = {
    maxRetries: config.maxRetries ?? 10,
    initialDelay: config.initialDelay ?? 1000,
    backoffFactor: config.backoffFactor ?? 2
  }

  // Create the object without the config property first
  const result = {
    get: config.bindWithRetry ? withRetry(get.bind(null, config), retryOptions) : get.bind(null, config),
    getAtRev: config.bindWithRetry ? withRetry(getAtRev.bind(null, config), retryOptions) : getAtRev.bind(null, config),
    put: config.bindWithRetry ? withRetry(put.bind(null, config), retryOptions) : put.bind(null, config),
    remove: config.bindWithRetry ? withRetry(remove.bind(null, config), retryOptions) : remove.bind(null, config),
    bulkGet: config.bindWithRetry ? withRetry(bulkGet.bind(null, config), retryOptions) : bulkGet.bind(null, config),
    bulkSave: config.bindWithRetry ? withRetry(bulkSave.bind(null, config), retryOptions) : bulkSave.bind(null, config),
    query: config.bindWithRetry ? withRetry(query.bind(null, config), retryOptions) : query.bind(null, config),
    queryStream: config.bindWithRetry ? withRetry(queryStream.bind(null, config), retryOptions) : queryStream.bind(null, config),
    // Sugar Methods
    patch: config.bindWithRetry ? withRetry(patch.bind(null, config), retryOptions) : patch.bind(null, config),
    patchDangerously: patchDangerously.bind(null, config), // patchDangerously not included in retry
    bulkRemove: config.bindWithRetry ? withRetry(bulkRemove.bind(null, config), retryOptions) : bulkRemove.bind(null, config),
    bulkRemoveMap: config.bindWithRetry ? withRetry(bulkRemoveMap.bind(null, config), retryOptions) : bulkRemoveMap.bind(null, config),
    bulkGetDictionary: config.bindWithRetry ? withRetry(bulkGetDictionary.bind(null, config), retryOptions) : bulkGetDictionary.bind(null, config),
    bulkSaveTransaction: bulkSaveTransaction.bind(null, config),
    createLock: createLock.bind(null, config),
    removeLock: removeLock.bind(null, config),
    watchDocs: watchDocs.bind(null, config),
    getDBInfo: config.bindWithRetry ? withRetry(getDBInfo.bind(null, config), retryOptions) : getDBInfo.bind(null, config)
  }

  return result
}

/** @type { import('./schema/bind.mjs').BindSchema } */
const bindConfig = Bind.implement((
  /** @type { import('./schema/config.mjs').CouchConfigSchema } */
  config
) => {
  const parsedConfig = CouchConfig.parse(config)

  /** @type { import('./schema/bind.mjs').BindBaseSchema } funcs */
  const funcs = doBind(parsedConfig)

  // Add the options function that returns a new bound instance
  // this allows the user to override some options
  const reconfig = (
    /** @type any  */
    _overrides
  ) => {
    // override the config and return doBind again
    const newConfig = { ...config, ..._overrides }
    return bindConfig(newConfig)
  }
  /** @type { import('./schema/bind.mjs').BindReturnsSchema } */
  const all = { ...funcs, options: reconfig }
  return all
})

/** @typedef { z.infer<typeof BindReturns> } DB */

export {
  get,
  getAtRev,
  put,
  remove,
  bulkGet,
  bulkSave,
  query,
  queryStream,
  schema,
  getDBInfo,

  // sugar methods
  patch,
  patchDangerously,
  bulkRemove,
  bulkRemoveMap,
  bulkGetDictionary,
  bulkSaveTransaction,

  bindConfig,
  withRetry,
  createQuery,
  createLock,
  removeLock
}
