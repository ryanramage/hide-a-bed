import { bulkGet, bulkSave, bulkRemove } from './impl/bulk.mjs'
import { get, put } from './impl/crud.mjs'
import { query } from './impl/query.mjs'
import { queryStream } from './impl/stream.mjs'

export { get, put, bulkGet, bulkSave, bulkRemove, query, queryStream }

