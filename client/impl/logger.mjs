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
  // If no logger provided, return no-op logger
  if (!config.logger) {
    return {
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {}
    }
  }

  // If logger is a function, wrap it to provide object interface
  if (typeof config.logger === 'function') {
    return {
      error: (...args) => config.logger('error', ...args),
      warn: (...args) => config.logger('warn', ...args),
      info: (...args) => config.logger('info', ...args),
      debug: (...args) => config.logger('debug', ...args)
    }
  }

  // If logger is an object, use its methods or provide no-ops for missing ones
  return {
    error: config.logger.error || (() => {}),
    warn: config.logger.warn || (() => {}),
    info: config.logger.info || (() => {}),
    debug: config.logger.debug || (() => {})
  }
}
