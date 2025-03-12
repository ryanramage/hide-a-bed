import { RetryableError } from './errors.mjs'
import { sleep } from './patch.mjs'

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
