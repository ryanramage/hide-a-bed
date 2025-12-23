import { createQuery } from './impl/utils/queryBuilder.mts'
import { QueryBuilder } from './impl/utils/queryBuilder.mts'
import { bindConfig } from './impl/bindConfig.mts'
import { withRetry } from './impl/retry.mts'
import { bulkGet, bulkGetDictionary } from './impl/bulkGet.mts'
import { getAtRev, get } from './impl/get.mts'
import { queryStream } from './impl/stream.mts'
import { patch, patchDangerously } from './impl/patch.mts'
import { put } from './impl/put.mts'
import { remove } from './impl/remove.mts'
import { bulkSave, bulkSaveTransaction } from './impl/bulkSave.mts'
import { query } from './impl/query.mts'
import { getDBInfo } from './impl/getDBInfo.mts'
import { bulkRemove, bulkRemoveMap } from './impl/bulkRemove.mts'
import { createLock, removeLock } from './impl/sugar/lock.mts'
import { watchDocs } from './impl/sugar/watch.mts'

export {
  get,
  getAtRev,
  put,
  remove,
  bulkGet,
  bulkSave,
  query,
  queryStream,
  getDBInfo,

  // sugar methods
  patch,
  patchDangerously,
  bulkRemove,
  bulkRemoveMap,
  bulkGetDictionary,
  bulkSaveTransaction,
  watchDocs,

  // binding
  bindConfig,
  withRetry,

  // utils
  QueryBuilder,
  createQuery,
  createLock,
  removeLock
}

export type {
  BulkGetBound,
  BulkGetDictionaryBound,
  BulkGetDictionaryOptions,
  BulkGetDictionaryResult,
  BulkGetOptions,
  BulkGetResponse,
  OnInvalidDocAction
} from './impl/bulkGet.mts'
export type { GetOptions, GetBound, GetAtRevBound } from './impl/get.mts'
export type { QueryBound } from './impl/query.mts'
export type {
  ViewString,
  ViewOptions as SimpleViewOptions
} from './schema/couch/couch.input.schema.ts'
export type {
  ViewRow,
  CouchDoc,
  CouchDocInput,
  ViewQueryResponse,
  ViewQueryResponseValidated,
  ViewRowValidated
} from './schema/couch/couch.output.schema.ts'
export type { RetryOptions } from './impl/retry.mts'
export type { NetworkError, RetryableError, NotFoundError } from './impl/utils/errors.mts'
export type { OnRow } from './impl/stream.mts'
export type { CouchConfig, CouchConfigInput } from './schema/config.mts'
export type { LockOptions, LockOptionsInput, LockDoc } from './schema/sugar/lock.mts'
export type {
  WatchOptions as WatchOptionsSchema,
  WatchOptionsInput
} from './schema/sugar/watch.mts'
export type { BoundInstance } from './impl/bindConfig.mts'
export type { StandardSchemaV1 } from './types/standard-schema.ts'
