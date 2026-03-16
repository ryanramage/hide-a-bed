import type { RequestOptions } from '../../schema/request.mts'

const definedSignals = (signals: Array<AbortSignal | undefined>): AbortSignal[] => {
  return signals.filter((signal): signal is AbortSignal => signal != null)
}

export const composeAbortSignal = (
  internalSignal?: AbortSignal,
  request?: RequestOptions
): {
  signal: AbortSignal | undefined
  timedOut: () => boolean
} => {
  const timeoutSignal =
    typeof request?.timeout === 'number' ? AbortSignal.timeout(request.timeout) : undefined
  const signals = definedSignals([internalSignal, request?.signal, timeoutSignal])

  return {
    signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
    timedOut: () => timeoutSignal?.aborted === true
  }
}
