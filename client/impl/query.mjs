// @ts-check

import { z } from 'zod' // eslint-disable-line
import needle from 'needle'
import { SimpleViewQuery, SimpleViewQueryResponse } from '../schema/query.mjs' // eslint-disable-line
import { RetryableError } from './errors.mjs'
import { createLogger } from './logger.mjs'

import pkg from 'lodash'
const { includes } = pkg

/**
 * @type { z.infer<SimpleViewQuery> }
 * @param {import('../schema/config.mjs').CouchConfigSchema} config
 * @param {string} view
 * @param {import('../schema/query.mjs').SimpleViewOptionsSchema} [options]
 */
export const query = SimpleViewQuery.implement(async (config, view, options = {}) => {
  const logger = createLogger(config)
  logger.info(`Starting view query: ${view}`)
  logger.debug('Query options:', options)

  // @ts-ignore
  let qs = queryString(options, ['key', 'startkey', 'endkey', 'reduce', 'group', 'group_level', 'stale', 'limit'])
  let method = 'GET'
  let payload = null
  const opts = {
    ...(config.needle || {}),
    json: true,
    headers: {
      ...config.needle?.headers,
      'Content-Type': 'application/json'
    }
  }

  // If keys are supplied, issue a POST to circumvent GET query string limits
  // see http://wiki.apache.org/couchdb/HTTP_view_API#Querying_Options
  if (typeof options.keys !== 'undefined') {
    const MAX_URL_LENGTH = 2000
    // according to http://stackoverflow.com/a/417184/680742,
    // the de facto URL length limit is 2000 characters

    const _options = JSON.parse(JSON.stringify(options))
    delete _options.keys
    qs = queryString(_options, ['key', 'startkey', 'endkey', 'reduce', 'group', 'group_level', 'stale', 'limit']) // dont need descening or skip, those will work

    const keysAsString = `keys=${JSON.stringify(options.keys)}`

    if (keysAsString.length + qs.length + 1 <= MAX_URL_LENGTH) {
      // If the keys are short enough, do a GET. we do this to work around
      // Safari not understanding 304s on POSTs (see pouchdb/pouchdb#1239)
      method = 'GET'
      if (qs.length > 0) qs += '&'
      else qs = ''
      qs += keysAsString
    } else {
      method = 'POST'
      payload = { keys: options.keys }
    }
  }

  logger.debug('Generated query string:', qs)
  const url = `${config.couch}/${view}?${qs.toString()}`
  // @ts-ignore
  let results
  try {
    logger.debug(`Sending ${method} request to: ${url}`)
    results = (method === 'GET') ? await needle('get', url, opts) : await needle('post', url, payload, opts)
  } catch (err) {
    logger.error('Network error during query:', err)
    RetryableError.handleNetworkError(err)
  }

  if (!results) {
    logger.error('No response received from query request')
    throw new RetryableError('no response', 503)
  }

  /** @type { z.infer<SimpleViewQueryResponse> } body */
  const body = results.body

  if (RetryableError.isRetryableStatusCode(results.statusCode)) {
    logger.warn(`Retryable status code received: ${results.statusCode}`)
    throw new RetryableError(body.error || 'retryable error during query', results.statusCode)
  }

  if (body.error) {
    logger.error(`Query error: ${body.error}`)
    throw new Error(body.error)
  }

  logger.info(`Successfully executed view query: ${view}`)
  logger.debug('Query response:', body)
  return body
})

/**
 * @param {{ [key: string]: any }} options - The options object containing query parameters.
 * @param {string[]} params - The list of parameter names to include in the query string.
 */
/**
 * @param {{ [key: string]: any }} options
 * @param {string[]} params
 * @returns {string}
 */
export function queryString (options = {}, params) {
  const parts = Object.keys(options).map(key => {
    let value = options[key]
    if (includes(params, key)) {
      if (typeof value === 'string' && key !== 'stale') value = `"${value}"`
      if (Array.isArray(value)) {
        value = '[' + value.map(i => {
          if (i === null) return 'null'
          if (typeof i === 'string') return `"${i}"`
          if (typeof i === 'object' && Object.keys(i).length === 0) return '{}'
          if (typeof i === 'object') return JSON.stringify(i)
          return i
        }).join(',') + ']'
      }
    }
    return `${key}=${value}`
  })
  return parts.join('&')
}
