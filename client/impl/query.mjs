// @ts-check

import { z } from 'zod' // eslint-disable-line
import needle from 'needle'
import { SimpleViewQuery, SimpleViewQueryResponse } from '../schema/query.mjs' // eslint-disable-line
import { RetryableError } from './errors.mjs'

import pkg from 'lodash'
const { includes } = pkg

/** @type { z.infer<SimpleViewQuery> } query */
export const query = SimpleViewQuery.implement(async (config, view, options) => {
  // @ts-ignore
  const qs = queryString(options, ['key', 'startkey', 'endkey', 'reduce', 'group', 'group_level', 'stale', 'limit'])

  const opts = {
    json: true,
    headers: {
      'Content-Type': 'application/json'
    }
  }
  const url = `${config.couch}/${view}?${qs.toString()}`
  // @ts-ignore
  let results
  try {
    results = await needle('get', url, opts)
  } catch (err) {
    RetryableError.handleNetworkError(err)
  }
  if (!results) throw new RetryableError('no response', 503)
  /** @type { z.infer<SimpleViewQueryResponse> } body */
  const body = results.body
  if (RetryableError.isRetryableStatusCode(results.statusCode)) {
    throw new RetryableError(body.error || 'retryable error during query', results.statusCode)
  }
  if (body.error) throw new Error(body.error)
  return body
})

/**
 * @param {{ [key: string]: any }} options - The options object containing query parameters.
 * @param {string[]} params - The list of parameter names to include in the query string.
 */
export function queryString (options, params) {
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
