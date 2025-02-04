import { bulkGet, bulkSave, bulkRemove } from './impl/bulk.mjs'
import { get, put } from './impl/crud.mjs'
import { patch } from './impl/patch.mjs'
import { query } from './impl/query.mjs'
import { queryStream } from './impl/stream.mjs'
import { BulkSave, BulkGet } from './schema/bulk.mjs'
import { CouchConfig } from './schema/config.mjs'
import { SimpleViewQuery, SimpleViewQueryResponse } from './schema/query.mjs'
import { PatchConfig, PatchDoc } from './schema/patch.mjs'
import { CouchDoc, CouchDocResponse, CouchPut, CouchGet } from './schema/crud.mjs'

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
  PatchDoc
}

export { get, put, patch, bulkGet, bulkSave, bulkRemove, query, queryStream, schema }
