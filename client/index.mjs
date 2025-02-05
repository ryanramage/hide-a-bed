// @ts-check */
import { bulkGet, bulkSave, bulkRemove } from './impl/bulk.mjs'
import { get, put } from './impl/crud.mjs'
import { patch } from './impl/patch.mjs'
import { query } from './impl/query.mjs'
import { queryStream } from './impl/stream.mjs'
import { BulkSave, BulkGet } from './schema/bulk.mjs'
import { CouchConfig } from './schema/config.mjs'
import { SimpleViewQuery, SimpleViewQueryResponse } from './schema/query.mjs'
import { PatchConfig, Patch } from './schema/patch.mjs'
import { CouchDoc, CouchDocResponse, CouchPut, CouchGet } from './schema/crud.mjs'
import { Bind } from './schema/bind.mjs'

const schema = {
  CouchConfig,
  SimpleViewQuery,
  SimpleViewQueryResponse,
  BulkSave,
  BulkGet,
  CouchGet,
  CouchPut,
  CouchDoc,
  CouchDocResponse,
  PatchConfig,
  Patch
}

/** @type { import('./schema/bind.mjs').BindSchema } */
const bindConfig = Bind.implement((
  /** @type { import('./schema/config.mjs').CouchConfigSchema } */
  config
) => {
  return {
    get: get.bind(null, config),
    put: put.bind(null, config),
    patch: patch.bind(null, config),
    bulkGet: bulkGet.bind(null, config),
    bulkSave: bulkSave.bind(null, config),
    bulkRemove: bulkRemove.bind(null, config),
    query: query.bind(null, config),
    queryStream: queryStream.bind(null, config)
  }
})

export { get, put, patch, bulkGet, bulkSave, bulkRemove, query, queryStream, schema, bindConfig }
