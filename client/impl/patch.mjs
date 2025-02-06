import { get, put } from './crud.mjs'
import { Patch } from '../schema/patch.mjs'

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** @type { import('../schema/patch.mjs').PatchSchema } */
export const patch = Patch.implement(async (config, id, properties) => {
  const maxRetries = config.retries || 5
  const delay = config.delay || 1000
  let attempts = 0

  while (attempts <= maxRetries) {
    try {
      const doc = await get(config, id)
      if (!doc) return { ok: false, statusCode: 404, error: 'not_found' }
      const updatedDoc = { ...doc, ...properties }
      const result = await put(config, updatedDoc)

      // Check if the response indicates a conflict
      if (result.ok) {
        return result
      }
      // If not ok, treat as conflict and retry
      attempts++
      if (attempts > maxRetries) {
        throw new Error(`Failed to patch after ${maxRetries} attempts`)
      }
      await sleep(delay)
    } catch (err) {
      if (err.message !== 'not_found') return { ok: false, statusCode: 404, error: 'not_found' }
      // Handle other errors (network, etc)
      attempts++
      if (attempts > maxRetries) {
        const error = `Failed to patch after ${maxRetries} attempts: ${err.message}`
        return { ok: false, statusCode: 500, error }
      }
      await sleep(delay)
    }
  }
})
