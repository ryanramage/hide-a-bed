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

/**
 * @typedef {Object} BoundFunctions
 * @property {import('./schema/crud.mjs').CouchGetSchema['implementation']} get
 * @property {import('./schema/crud.mjs').CouchPutSchema['implementation']} put
 * @property {import('./schema/patch.mjs').PatchSchema['implementation']} patch
 * @property {import('./schema/bulk.mjs').BulkGetSchema['implementation']} bulkGet
 * @property {import('./schema/bulk.mjs').BulkSaveSchema['implementation']} bulkSave
 * @property {import('./schema/bulk.mjs').BulkRemoveSchema['implementation']} bulkRemove
 * @property {import('./schema/query.mjs').SimpleViewQuery['implementation']} query
 * @property {(view: string, options: any) => Promise<null>} queryStream
 */

/**
 * Binds all API functions to a specific configuration
 * @param {import('./schema/config.mjs').CouchConfig} config - The CouchDB configuration
 * @returns {BoundFunctions} The bound API functions
 */
const bindConfig = (config) => {
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
}

export { get, put, patch, bulkGet, bulkSave, bulkRemove, query, queryStream, schema, bindConfig }
