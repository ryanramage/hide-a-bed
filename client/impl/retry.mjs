import { RetryableError } from './errors.mjs'
import { sleep } from './patch.mjs'

export function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000, // 1 second
    backoffFactor = 2    // exponential backoff multiplier
  } = options

  return async (...args) => {
    let lastError
    let delay = initialDelay

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args)
      } catch (error) {
        lastError = error
        
        // Only retry if it's a RetryableError
        if (!(error instanceof RetryableError)) {
          throw error
        }

        // If we've used all retries, throw the last error
        if (attempt === maxRetries) {
          throw error
        }

        // Wait with exponential backoff
        await sleep(delay)
        delay *= backoffFactor
      }
    }

    throw lastError
  }
}
