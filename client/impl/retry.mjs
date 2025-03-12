import { RetryableError } from './errors.mjs'
import { sleep } from './patch.mjs'

/**
 * Wraps a function with retry logic for RetryableError instances
 * @param {Function} fn - The function to retry
 * @param {Object} options - Retry options
 * @param {number} [options.maxRetries=3] - Maximum number of retry attempts
 * @param {number} [options.initialDelay=1000] - Initial delay in ms
 * @param {number} [options.backoffFactor=2] - Multiplier for exponential backoff
 * @param {number} [options.maxDelay] - Maximum delay between retries in ms
 * @returns {Function} - Wrapped function with retry logic
 */
export function withRetry (fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000, // 1 second
    backoffFactor = 2, // exponential backoff multiplier
    maxDelay = 30000 // 30 seconds max delay
  } = options

  return async (...args) => {
    let delay = initialDelay

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Clear any references to previous attempts
        const result = await fn(...args)
        return result
      } catch (error) {
        // Only retry if it's a RetryableError
        if (!(error instanceof RetryableError)) {
          throw error
        }

        // If we've used all retries, throw the error
        if (attempt === maxRetries) {
          throw error
        }

        // Calculate next delay with a maximum cap
        const nextDelay = Math.min(delay, maxDelay)
        
        // Wait with exponential backoff
        await sleep(nextDelay)
        delay *= backoffFactor
      }
    }
  }
}
