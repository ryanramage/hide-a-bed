// @ts-check
import { z } from 'zod'
import { CouchConfig } from './config.mjs'
import { BulkSaveBound, BulkGetBound } from './bulk.mjs'
import { CouchGetBound, CouchPutBound } from './crud.mjs'
import { PatchBound } from './patch.mjs'
import { SimpleViewQueryBound } from './query.mjs'

const BindReturns = z.object({
  bulkGet: BulkGetBound,
  bulkSave: BulkSaveBound,
  get: CouchGetBound,
  put: CouchPutBound,
  patch: PatchBound,
  query: SimpleViewQueryBound
})

export const Bind = z.function().args(CouchConfig).returns(BindReturns)
/** @typedef { z.infer<typeof Bind> } BindSchema */
