import { setTimeout } from 'node:timers/promises'
import { RetryableError } from './utils/errors.mts'

/**
 * Settings that control how retry attempts are scheduled.
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts before rethrowing the original error.
   */
  maxRetries?: number
  /**
   * Initial wait duration in milliseconds before attempting the first retry.
   */
  initialDelay?: number
  /**
   * Multiplier applied to the delay after each retry to implement exponential backoff.
   */
  backoffFactor?: number
  /**
   * Upper bound, in milliseconds, for the delay between retries.
   */
  maxDelay?: number
}

type MaybePromise<T> = PromiseLike<T> | T

/**
 * Wrap an async-capable function with retry semantics that respect {@link RetryableError}.
 * @typeParam Fn - The function signature to decorate with retry handling.
 * @param fn The function to invoke with retry support.
 * @param options Retry tuning parameters.
 * @returns A function mirroring `fn` that automatically retries on {@link RetryableError}.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withRetry<Fn extends (...args: any[]) => MaybePromise<any>>(
  fn: Fn,
  options: RetryOptions = {}
): (...args: Parameters<Fn>) => Promise<Awaited<ReturnType<Fn>>> {
  const { maxRetries = 3, initialDelay = 1000, backoffFactor = 2, maxDelay = 30000 } = options

  return async (...args: Parameters<Fn>): Promise<Awaited<ReturnType<Fn>>> => {
    let delay = initialDelay

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn(...args)
        return result
      } catch (error) {
        if (!(error instanceof RetryableError)) {
          throw error
        }

        if (attempt === maxRetries) {
          throw error
        }

        const nextDelay = Math.min(delay, maxDelay)
        await setTimeout(nextDelay)
        delay *= backoffFactor
      }
    }

    throw new RetryableError('withRetry exhausted retry attempts without resolving the operation')
  }
}
