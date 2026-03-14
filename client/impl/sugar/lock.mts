import { LockOptions } from '../../schema/sugar/lock.mts'
import { put } from '../put.mts'
import { get } from '../get.mts'
import { createLogger } from '../utils/logger.mts'
import { CouchConfig, type CouchConfigInput } from '../../schema/config.mts'
import { isConflictError } from '../utils/errors.mts'

/**
 * Create a lock document for the specified document ID.
 * Returns true if the lock was created, false if locking is disabled or a conflict occurred.
 *
 * @param configInput CouchDB configuration
 * @param docId The document ID to lock
 * @param lockOptions Locking options
 *
 * @return True if the lock was created, false otherwise
 */
export async function createLock(
  configInput: CouchConfigInput,
  docId: string,
  lockOptions: LockOptions
): Promise<boolean> {
  const config = CouchConfig.parse(configInput)
  const options = LockOptions.parse(lockOptions)

  const logger = createLogger(config)

  if (!options.enableLocking) {
    logger.debug('Locking disabled, returning true without creating lock')
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
    if (isConflictError(error)) {
      logger.warn(`Lock conflict for ${docId} - already locked`)
    } else {
      logger.error(`Error creating lock for ${docId}:`, error)
    }
    return false
  }
}

/**
 * Remove the lock document for the specified document ID if owned by the caller.
 *
 * @param configInput CouchDB configuration
 * @param docId The document ID to unlock
 * @param lockOptions Locking options
 *
 * @return Promise that resolves when the unlock operation is complete
 */
export async function removeLock(
  configInput: CouchConfigInput,
  docId: string,
  lockOptions: LockOptions
): Promise<void> {
  const config = CouchConfig.parse(configInput)
  const options = LockOptions.parse(lockOptions)
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
}
