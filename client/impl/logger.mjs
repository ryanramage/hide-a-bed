/**
 * @typedef {Object} Logger
 * @property {(...args: any[]) => void} error - Log error messages
 * @property {(...args: any[]) => void} warn - Log warning messages
 * @property {(...args: any[]) => void} info - Log info messages
 * @property {(...args: any[]) => void} debug - Log debug messages
 */

/**
 * Creates a unified logger interface that works with both function and object-style loggers
 * @param {import('../schema/config.mjs').CouchConfigSchema} config
 * @returns {Logger} Normalized logger interface
 */
export function createLogger(config) {
  // Return cached logger if it exists
  if (config._normalizedLogger) {
    return config._normalizedLogger
  }

  // If no logger provided, use console if useConsoleLogger is set, otherwise return no-op logger
  if (!config.logger) {
    if (config.useConsoleLogger) {
      config._normalizedLogger = {
        error: (...args) => console.error(...args),
        warn: (...args) => console.warn(...args),
        info: (...args) => console.info(...args),
        debug: (...args) => console.debug(...args)
      }
    } else {
      config._normalizedLogger = {
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {}
      }
    }
    return config._normalizedLogger
  }

  // If logger is a function, wrap it to provide object interface
  if (typeof config.logger === 'function') {
    config._normalizedLogger = {
      error: (...args) => config.logger('error', ...args),
      warn: (...args) => config.logger('warn', ...args),
      info: (...args) => config.logger('info', ...args),
      debug: (...args) => config.logger('debug', ...args)
    }
    return config._normalizedLogger
  }

  // If logger is an object, use its methods or provide no-ops for missing ones
  config._normalizedLogger = {
    error: config.logger.error || (() => {}),
    warn: config.logger.warn || (() => {}),
    info: config.logger.info || (() => {}),
    debug: config.logger.debug || (() => {})
  }
  return config._normalizedLogger
}
