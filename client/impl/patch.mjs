import { get, put } from './crud.mjs'
import { Patch } from '../schema/patch.mjs'
import { createLogger } from './logger.mjs'

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** @type { import('../schema/patch.mjs').PatchSchema } */
export const patch = Patch.implement(async (config, id, properties) => {
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
      await sleep(delay)
      delay *= config.backoffFactor
      logger.debug(`Next retry delay: ${delay}ms`)
    } catch (err) {
      if (err.message === 'not_found') {
        logger.warn(`Document ${id} not found during patch operation`)
        return { ok: false, statusCode: 404, error: 'not_found' }
      }

      // Handle other errors (network, etc)
      attempts++
      if (attempts > maxRetries) {
        const error = `Failed to patch after ${maxRetries} attempts: ${err.message}`
        logger.error(error)
        return { ok: false, statusCode: 500, error }
      }

      logger.warn(`Error during patch attempt ${attempts}: ${err.message}`)
      await sleep(delay)
      logger.debug(`Retrying after ${delay}ms`)
    }
  }
})
