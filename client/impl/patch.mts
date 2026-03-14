import { put } from './put.mts'
import { get } from './get.mts'
import { createLogger } from './utils/logger.mts'
import { setTimeout } from 'node:timers/promises'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { z } from 'zod'

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
 * @throws Error if the _rev does not match or other errors occur
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
  const doc = await get(config, id)
  if (doc?._rev !== properties._rev) {
    return {
      statusCode: 409,
      ok: false,
      error: 'conflict'
    }
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
 * @throws Error if max retries are exceeded or other errors occur
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

  while (attempts <= maxRetries) {
    logger.debug(`Attempt ${attempts + 1} of ${maxRetries + 1}`)
    try {
      const doc = await get(config, id)
      if (!doc) {
        logger.warn(`Document ${id} not found`)
        return { ok: false, statusCode: 404, error: 'not_found' }
      }

      const updatedDoc = { ...doc, ...properties }
      logger.debug('Merged document:', updatedDoc)

      const result = await put(config, updatedDoc)

      // Check if the response indicates a conflict
      if (result.ok) {
        logger.info(`Successfully patched document ${id}, rev: ${result.rev}`)
        return result
      }

      // If not ok, treat as conflict and retry
      attempts++
      if (attempts > maxRetries) {
        logger.error(`Failed to patch ${id} after ${maxRetries} attempts`)
        throw new Error(`Failed to patch after ${maxRetries} attempts`)
      }

      logger.warn(`Conflict detected for ${id}, retrying (attempt ${attempts})`)
      await setTimeout(delay)
      delay *= config.backoffFactor || 2
      logger.debug(`Next retry delay: ${delay}ms`)
    } catch (err) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'message' in err &&
        err.message === 'not_found'
      ) {
        logger.warn(`Document ${id} not found during patch operation`)
        return { ok: false, statusCode: 404, error: 'not_found' }
      }

      // Handle other errors (network, etc)
      attempts++
      if (attempts > maxRetries) {
        const error = `Failed to patch after ${maxRetries} attempts: ${err}`
        logger.error(error)
        return { ok: false, statusCode: 500, error }
      }

      logger.warn(`Error during patch attempt ${attempts}: ${err}`)
      await setTimeout(delay)
      logger.debug(`Retrying after ${delay}ms`)
    }
  }
}
