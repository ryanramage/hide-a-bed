// @ts-check */
import { bulkGet, bulkSave, bulkRemove } from './impl/bulk.mjs'
import { get, put } from './impl/crud.mjs'
import { patch } from './impl/patch.mjs'
import { query } from './impl/query.mjs'
import { queryStream } from './impl/stream.mjs'
import { withRetry } from './impl/retry.mjs'
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
  // Default retry options
  const retryOptions = {
    maxRetries: config.maxRetries ?? 3,
    initialDelay: config.initialDelay ?? 1000,
    backoffFactor: config.backoffFactor ?? 2
  }

  return {
    get: withRetry(get.bind(null, config), retryOptions),
    put: withRetry(put.bind(null, config), retryOptions),
    patch: patch.bind(null, config), // patch not included in retry
    bulkGet: withRetry(bulkGet.bind(null, config), retryOptions),
    bulkSave: withRetry(bulkSave.bind(null, config), retryOptions),
    bulkRemove: withRetry(bulkRemove.bind(null, config), retryOptions),
    query: withRetry(query.bind(null, config), retryOptions),
    queryStream: queryStream.bind(null, config) // stream not included in retry
  }
})

export { get, put, patch, bulkGet, bulkSave, bulkRemove, query, queryStream, schema, bindConfig }
