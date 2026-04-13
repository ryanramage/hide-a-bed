// oxlint-disable typescript/no-explicit-any
import type z from 'zod'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { withRetry } from './retry.mts'
import {
  type BulkGetBound,
  bulkGet,
  type BulkGetDictionaryBound,
  bulkGetDictionary
} from './bulkGet.mts'
import { type GetBound, type GetAtRevBound, getAtRev, get } from './get.mts'
import { queryStream } from './stream.mts'
import { patch, patchDangerously } from './patch.mts'
import { put } from './put.mts'
import type { QueryBound } from './query.mts'
import { query } from './query.mts'
import { bulkRemove, bulkRemoveMap } from './bulkRemove.mts'
import { bulkSave, bulkSaveTransaction } from './bulkSave.mts'
import { getDBInfo } from './getDBInfo.mts'
import { headDB } from './headDB.mts'
import { remove } from './remove.mts'
import { createLock, removeLock } from './sugar/lock.mts'
import { watchDocs } from './sugar/watch.mts'

type BoundConfigMethod<T> = T extends (...args: infer Args) => infer Result
  ? Args extends [unknown, ...infer Rest]
    ? (...args: Rest) => Result
    : never
  : never

type BoundMethods = {
  bulkGet: BulkGetBound
  bulkGetDictionary: BulkGetDictionaryBound
  get: GetBound
  getAtRev: GetAtRevBound
  query: QueryBound
  bulkRemove: BoundConfigMethod<typeof bulkRemove>
  bulkRemoveMap: BoundConfigMethod<typeof bulkRemoveMap>
  bulkSave: BoundConfigMethod<typeof bulkSave>
  bulkSaveTransaction: BoundConfigMethod<typeof bulkSaveTransaction>
  getDBInfo: BoundConfigMethod<typeof getDBInfo>
  headDB: BoundConfigMethod<typeof headDB>
  patch: BoundConfigMethod<typeof patch>
  patchDangerously: BoundConfigMethod<typeof patchDangerously>
  put: BoundConfigMethod<typeof put>
  queryStream: BoundConfigMethod<typeof queryStream>
  remove: BoundConfigMethod<typeof remove>
  createLock: BoundConfigMethod<typeof createLock>
  removeLock: BoundConfigMethod<typeof removeLock>
  watchDocs: BoundConfigMethod<typeof watchDocs>
}

export type BoundInstance = BoundMethods & {
  options(overrides: Partial<z.input<typeof CouchConfig>>): BoundInstance
}

/**
 * Build a validated binding that exposes CouchDB helpers plus an options() helper for overrides.
 * @param config The CouchDB configuration
 * @returns A bound instance with CouchDB operations and an options() method for overrides
 */
export const bindConfig = (config: CouchConfigInput): BoundInstance => {
  const parsedConfig = CouchConfig.parse(config)

  const funcs = doBind(parsedConfig)

  // Add the options function that returns a new bound instance
  // this allows the user to override some options
  const reconfigure: BoundInstance['options'] = (overrides: Partial<CouchConfigInput>) => {
    const newConfig: z.input<typeof CouchConfig> = { ...config, ...overrides }
    return bindConfig(newConfig)
  }

  const bound: BoundInstance = { ...funcs, options: reconfigure }
  return bound
}

/**
 * @internal
 *
 * Helper to bind a function to a config, optionally wrapping it with retry logic.
 * Casts to the appropriate bound function type.
 * @param func The function to bind
 * @param config The CouchDB configuration
 * @returns The bound function, possibly wrapped with retry logic
 */
export function getBoundWithRetry<TBound extends (...args: any[]) => Promise<any>>(
  func: (config: CouchConfig, ...args: any[]) => Promise<any>,
  config: CouchConfig
) {
  const bound = func.bind(null, config)
  if (config.bindWithRetry) {
    return withRetry(bound, {
      maxRetries: config.maxRetries ?? 10,
      initialDelay: config.initialDelay ?? 1000,
      backoffFactor: config.backoffFactor ?? 2
    }) as TBound
  } else {
    return bound as TBound
  }
}

/**
 * @internal
 *
 * Bind core CouchDB operations to a specific configuration, optionally applying retry wrappers.
 * @param config The CouchDB configuration
 * @returns An object with CouchDB operations bound to the provided configuration
 */
function doBind(config: CouchConfig): BoundMethods {
  // Default retry options
  const retryOptions = {
    maxRetries: config.maxRetries ?? 10,
    initialDelay: config.initialDelay ?? 1000,
    backoffFactor: config.backoffFactor ?? 2
  }

  // Create the object without the config property first
  const result: BoundMethods = {
    /**
     * These functions use overloaded signatures when bound.
     * To preserve the overloads we need dedicated Bound types
     */
    bulkGet: getBoundWithRetry<BulkGetBound>(bulkGet, config),
    bulkGetDictionary: getBoundWithRetry<BulkGetDictionaryBound>(bulkGetDictionary, config),
    get: getBoundWithRetry<GetBound>(get, config),
    getAtRev: getBoundWithRetry<GetAtRevBound>(getAtRev, config),
    query: getBoundWithRetry<QueryBound>(query, config),

    /**
     * These functions have single signatures and can be bound directly
     */
    bulkRemove: config.bindWithRetry
      ? withRetry(bulkRemove.bind(null, config), retryOptions)
      : bulkRemove.bind(null, config),
    bulkRemoveMap: config.bindWithRetry
      ? withRetry(bulkRemoveMap.bind(null, config), retryOptions)
      : bulkRemoveMap.bind(null, config),
    bulkSave: config.bindWithRetry
      ? withRetry(bulkSave.bind(null, config), retryOptions)
      : bulkSave.bind(null, config),
    bulkSaveTransaction: bulkSaveTransaction.bind(null, config),
    getDBInfo: config.bindWithRetry
      ? withRetry(getDBInfo.bind(null, config), retryOptions)
      : getDBInfo.bind(null, config),
    headDB: config.bindWithRetry
      ? withRetry(headDB.bind(null, config), retryOptions)
      : headDB.bind(null, config),
    patch: config.bindWithRetry
      ? withRetry(patch.bind(null, config), retryOptions)
      : patch.bind(null, config),
    patchDangerously: patchDangerously.bind(null, config), // patchDangerously not included in retry
    put: config.bindWithRetry
      ? withRetry(put.bind(null, config), retryOptions)
      : put.bind(null, config),
    queryStream: config.bindWithRetry
      ? withRetry(queryStream.bind(null, config), retryOptions)
      : queryStream.bind(null, config),
    remove: config.bindWithRetry
      ? withRetry(remove.bind(null, config), retryOptions)
      : remove.bind(null, config),

    createLock: createLock.bind(null, config),
    removeLock: removeLock.bind(null, config),
    watchDocs: watchDocs.bind(null, config)
  }

  return result
}
