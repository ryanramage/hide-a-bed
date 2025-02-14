import { CreateLock, RemoveLock } from '../../schema/sugar/lock.mjs'
import { put, get } from '../crud.mjs'
import { createLogger } from '../logger.mjs'

/** @type {import('../../schema/sugar/lock.mjs').CreateLockSchema} */
export const createLock = CreateLock.implement(async (config, docId, options) => {
  const logger = createLogger(config)
  
  if (!options.enableLocking) {
    logger.debug('Locking disabled, returning true')
    return true
  }

  const _id = `lock-${docId}`
  const lock = {
    _id,
    type: 'lock',
    locks: docId,
    lockedAt: new Date().toISOString(),
    lockedBy: options.username
  }

  try {
    const result = await put(config, lock)
    logger.info(`Lock created for ${docId} by ${options.username}`)
    return result.ok === true
  } catch (error) {
    if (error.status === 409) {
      logger.warn(`Lock conflict for ${docId} - already locked`)
    } else {
      logger.error(`Error creating lock for ${docId}:`, error)
    }
    return false
  }
})

/** @type {import('../../schema/sugar/lock.mjs').RemoveLockSchema} */
export const removeLock = RemoveLock.implement(async (config, docId, options) => {
  const logger = createLogger(config)
  
  if (!options.enableLocking) {
    logger.debug('Locking disabled, skipping unlock')
    return
  }

  if (!docId) {
    logger.warn('No docId provided for unlock')
    return
  }

  const _id = `lock-${docId}`
  const existingLock = await get(config, _id)
  
  if (!existingLock) {
    logger.debug(`No lock found for ${docId}`)
    return
  }

  if (existingLock.lockedBy !== options.username) {
    logger.warn(`Cannot remove lock for ${docId} - owned by ${existingLock.lockedBy}`)
    return
  }

  try {
    await put(config, { ...existingLock, _deleted: true })
    logger.info(`Lock removed for ${docId}`)
  } catch (error) {
    logger.error(`Error removing lock for ${docId}:`, error)
  }
})
