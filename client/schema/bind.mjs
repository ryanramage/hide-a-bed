// @ts-check
import { z } from 'zod'
import { CouchConfig } from './config.mjs'
import { BulkSaveBound, BulkGetBound, BulkRemoveBound, BulkRemoveMapBound, BulkGetDictionaryBound, BulkSaveTransactionBound } from './bulk.mjs'
import { CouchGetBound, CouchPutBound, CouchGetAtRevBound, CouchRemoveBound } from './crud.mjs'
import { PatchBound } from './patch.mjs'
import { SimpleViewQueryBound } from './query.mjs'
import { SimpleViewQueryStreamBound } from './stream.mjs'
import { CreateLockBound, RemoveLockBound } from './sugar/lock.mjs'
import { WatchDocsBound } from './sugar/watch.mjs'
import { GetDBInfoBound } from './util.mjs'

export const BindBase = z.object({
  bulkGet: BulkGetBound,
  bulkSave: BulkSaveBound,
  bulkRemove: BulkRemoveBound,
  bulkRemoveMap: BulkRemoveMapBound,
  bulkGetDictionary: BulkGetDictionaryBound,
  bulkSaveTransaction: BulkSaveTransactionBound,
  get: CouchGetBound,
  getAtRev: CouchGetAtRevBound,
  put: CouchPutBound,
  remove: CouchRemoveBound,
  patch: PatchBound,
  query: SimpleViewQueryBound,
  queryStream: SimpleViewQueryStreamBound,
  createLock: CreateLockBound,
  removeLock: RemoveLockBound,
  watchDocs: WatchDocsBound,
  getDBInfo: GetDBInfoBound
})
/** @typedef { z.infer<typeof BindBase> } BindBaseSchema */

const RebindOptions = CouchConfig.omit({ couch: true })

// Define a recursive type where config returns the same type
export const BindReturns = BindBase.extend({
  options: z.function().args(RebindOptions).returns(BindBase)
})
/** @typedef { z.infer<typeof BindReturns> } BindReturnsSchema */

export const Bind = z.function().args(CouchConfig).returns(BindReturns)
/** @typedef { z.infer<typeof Bind> } BindSchema */
