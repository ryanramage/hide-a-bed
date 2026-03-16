import { put } from './put.mts'
import { get } from './get.mts'
import { createLogger } from './utils/logger.mts'
import { setTimeout } from 'node:timers/promises'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { z } from 'zod'
import { ConflictError, HideABedError, OperationError, RetryableError } from './utils/errors.mts'

const PatchProperties = z
  .looseObject({
    _rev: z.string('_rev is required for patch operations')
  })
  .describe('Patch payload with _rev')

/**
 * Patch a CouchDB document by merging provided properties.
 * Validates that the _rev matches before applying the patch.
 *
 * @param configInput - CouchDB configuration
 * @param id - Document ID to patch
 * @param _properties - Properties to merge into the document (must include _rev)
 * @returns The result of the put operation
 *
 * @throws {ConflictError} When the supplied `_rev` does not match the current document revision.
 * @throws {NotFoundError} When the document does not exist.
 * @throws {RetryableError} When a retryable transport or HTTP failure occurs while reading or saving.
 * @throws {OperationError} When a non-retryable operational failure occurs.
 */
export const patch = async (
  configInput: CouchConfigInput,
  id: string,
  _properties: z.infer<typeof PatchProperties>
) => {
  const config = CouchConfig.parse(configInput)
  const properties = PatchProperties.parse(_properties)
  const logger = createLogger(configInput)

  logger.info(`Starting patch operation for document ${id}`)
  logger.debug('Patch properties:', properties)
  const doc = await get({ ...config, throwOnGetNotFound: true }, id)
  if (!doc) {
    throw new OperationError('Patch failed', {
      docId: id,
      operation: 'patch'
    })
  }
  if (doc._rev !== properties._rev) {
    throw new ConflictError(id, { operation: 'patch' })
  }

  const updatedDoc = { ...doc, ...properties }
  logger.debug('Merged document:', updatedDoc)
  const result = await put(config, updatedDoc)
  logger.info(`Successfully patched document ${id}, rev: ${result.rev}`)
  return result
}

/**
 * Patch a CouchDB document by merging provided properties.
 * This function will retry on conflicts using an exponential backoff strategy.
 *
 * @remarks patchDangerously can clobber data. It will retry even if a conflict happens. There are some use cases for this, but you have been warned, hence the name.
 *
 * @param configInput - CouchDB configuration
 * @param id - Document ID to patch
 * @param properties - Properties to merge into the document
 * @returns The result of the put operation or an error if max retries are exceeded
 *
 * @throws {NotFoundError} When the document does not exist.
 * @throws {RetryableError} When a retryable transport or HTTP failure occurs before retries are exhausted.
 * @throws {OperationError} When retries are exhausted or a non-retryable operational failure occurs.
 */
export const patchDangerously = async (
  configInput: CouchConfigInput,
  id: string,
  properties: Record<string, unknown>
) => {
  const config = CouchConfig.parse(configInput)
  const logger = createLogger(config)
  const maxRetries = config.maxRetries || 5
  let delay = config.initialDelay || 1000
  let attempts = 0

  logger.info(`Starting patch operation for document ${id}`)
  logger.debug('Patch properties:', properties)
  let lastError: unknown

  while (attempts <= maxRetries) {
    logger.debug(`Attempt ${attempts + 1} of ${maxRetries + 1}`)
    try {
      const doc = await get({ ...config, throwOnGetNotFound: true }, id)
      if (!doc) {
        throw new OperationError('Patch failed', {
          docId: id,
          operation: 'patchDangerously'
        })
      }
      const updatedDoc = { ...doc, ...properties }
      logger.debug('Merged document:', updatedDoc)

      const result = await put(config, updatedDoc)
      logger.info(`Successfully patched document ${id}, rev: ${result.rev}`)
      return result
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err
      }

      if (!(err instanceof ConflictError) && !(err instanceof RetryableError)) {
        throw err
      }

      lastError = err
      attempts++
      if (attempts > maxRetries) {
        logger.error(`Failed to patch ${id} after ${maxRetries} attempts`, err)
        throw new OperationError('Patch failed', {
          cause: err,
          couchError: err instanceof HideABedError ? err.couchError : undefined,
          docId: id,
          operation: 'patchDangerously',
          statusCode: err instanceof HideABedError ? err.statusCode : undefined
        })
      }

      logger.warn(`Error during patch attempt ${attempts}: ${err}`)
      await setTimeout(delay)
      delay *= config.backoffFactor || 2
      logger.debug(`Retrying after ${delay}ms`)
    }
  }

  throw new OperationError('Patch failed', {
    cause: lastError,
    docId: id,
    operation: 'patchDangerously'
  })
}
