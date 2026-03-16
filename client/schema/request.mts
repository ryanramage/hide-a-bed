import { z } from 'zod'

const isAbortSignal = (value: unknown): value is AbortSignal => {
  return value instanceof AbortSignal
}

export type Dispatcher = RequestInit['dispatcher']

export type RequestOptions = {
  dispatcher?: Dispatcher
  signal?: AbortSignal
  timeout?: number
}

export type RequestOptionsInput = RequestOptions

const isDispatcher = (value: unknown): value is Dispatcher => {
  if (typeof value !== 'object' || value === null) return false
  return typeof (value as { dispatch?: unknown }).dispatch === 'function'
}

export const RequestOptions: z.ZodType<RequestOptions, RequestOptionsInput> = z.strictObject({
  dispatcher: z
    .custom<Dispatcher>(isDispatcher, {
      message: 'dispatcher must expose a dispatch method'
    })
    .optional()
    .describe('dispatcher to use for the request'),
  signal: z
    .custom<AbortSignal>(isAbortSignal, {
      message: 'signal must be an AbortSignal'
    })
    .optional()
    .describe('abort signal for the request'),
  timeout: z.number().nonnegative().optional().describe('request timeout in milliseconds')
})
