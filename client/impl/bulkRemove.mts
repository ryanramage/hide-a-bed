import { bulkGet } from './bulkGet.mts'
import { bulkSave } from './bulkSave.mts'
import { createLogger } from './utils/logger.mts'
import { remove } from './remove.mts'
import { CouchDoc } from '../schema/couch/couch.output.schema.ts'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'

/**
 * Removes multiple documents from a CouchDB database using the _bulk_docs endpoint.
 * It first retrieves the documents by their IDs, marks them as deleted, and then
 * sends them back to the database for deletion.
 *
 * See https://docs.couchdb.org/en/stable/api/database/bulk-api.html#post--db-_bulk_docs
 *
 * @param configInput - The CouchDB configuration input.
 * @param ids - An array of document IDs to be removed.
 * @returns A promise that resolves to an array of results from the bulk delete operation.
 *
 * @example
 * ```ts
 * const config: CouchConfigInput = {
 *   couch: 'http://localhost:5984/mydb',
 *   useConsoleLogger: true
 * };
 * const idsToRemove = ['doc1', 'doc2', 'doc3'];
 * const results = await bulkRemove(config, idsToRemove);
 * console.log(results);
 * ```
 *
 * @throws Will throw an error if the provided configuration is invalid or if the bulk delete operation fails.
 */
export const bulkRemove = async (configInput: CouchConfigInput, ids: string[]) => {
  const config = CouchConfig.parse(configInput)
  const logger = createLogger(config)
  logger.info(`Starting bulk remove for ${ids.length} documents`)
  const resp = await bulkGet(config, ids)
  const toRemove: Array<CouchDoc> = []
  resp.rows?.forEach(row => {
    if (!row.doc) return
    try {
      const d = CouchDoc.parse(row.doc)
      d._deleted = true
      toRemove.push(d)
    } catch (e) {
      logger.warn(`Invalid document structure in bulk remove: ${row.id}`, e)
    }
  })
  if (!toRemove.length) return []
  const result = await bulkSave(config, toRemove)
  return result
}

/**
 * Removes multiple documents from a CouchDB database by their IDs using individual delete operations.
 * It first retrieves the documents to get their revision IDs, then deletes each document one by one.
 *
 * See https://docs.couchdb.org/en/stable/api/document/common.html#delete--db-docid
 *
 * @param configInput - The CouchDB configuration input.
 * @param ids - An array of document IDs to be removed.
 * @returns A promise that resolves to an array of results from the individual delete operations.
 *
 * @example
 * ```ts
 * const config: CouchConfigInput = {
 *   couch: 'http://localhost:5984/mydb',
 *   useConsoleLogger: true
 * };
 * const idsToRemove = ['doc1', 'doc2', 'doc3'];
 * const results = await bulkRemoveMap(config, idsToRemove);
 * console.log(results);
 * ```
 *
 * @throws Will throw an error if the provided configuration is invalid or if any delete operation fails.
 */
export const bulkRemoveMap = async (configInput: CouchConfigInput, ids: string[]) => {
  const config = CouchConfig.parse(configInput)
  const logger = createLogger(config)
  logger.info(`Starting bulk remove map for ${ids.length} documents`)

  const { rows } = await bulkGet(config, ids, { includeDocs: false })

  const results = []
  for (const row of rows || []) {
    try {
      if (!row.value?.rev) throw new Error(`no rev found for doc ${row.id}`)
      if (!row.id) {
        throw new Error(`no id found for doc ${row}`)
      }

      const result = await remove(config, row.id, row.value.rev)
      results.push(result)
    } catch (e) {
      logger.warn(`Error removing a doc in bulk remove map: ${row.id}`, e)
    }
  }
  return results
}
