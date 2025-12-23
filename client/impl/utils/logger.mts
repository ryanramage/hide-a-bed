import type { CouchConfigInput } from '../../schema/config.mts'

type LoggerMethod = (...args: unknown[]) => void

export type Logger = {
  error: LoggerMethod
  warn: LoggerMethod
  info: LoggerMethod
  debug: LoggerMethod
}

type FunctionLogger = (level: keyof Logger, ...args: unknown[]) => void

const noop: LoggerMethod = () => {}

const createConsoleLogger = (): Logger => ({
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args),
  info: (...args) => console.info(...args),
  debug: (...args) => console.debug(...args)
})

const createNoopLogger = (): Logger => ({
  error: noop,
  warn: noop,
  info: noop,
  debug: noop
})

export function createLogger(config: CouchConfigInput): Logger {
  if (config['~normalizedLogger']) {
    return config['~normalizedLogger']
  }

  if (!config.logger) {
    const normalized = config.useConsoleLogger ? createConsoleLogger() : createNoopLogger()
    config['~normalizedLogger'] = normalized
    return normalized
  }

  if (typeof config.logger === 'function') {
    const loggerFn = config.logger as FunctionLogger
    const normalized: Logger = {
      error: (...args) => loggerFn('error', ...args),
      warn: (...args) => loggerFn('warn', ...args),
      info: (...args) => loggerFn('info', ...args),
      debug: (...args) => loggerFn('debug', ...args)
    }
    config['~normalizedLogger'] = normalized
    return normalized
  }

  const loggerObj = config.logger as Partial<Logger>
  const normalized: Logger = {
    error: loggerObj.error ?? noop,
    warn: loggerObj.warn ?? noop,
    info: loggerObj.info ?? noop,
    debug: loggerObj.debug ?? noop
  }
  config['~normalizedLogger'] = normalized
  return normalized
}
