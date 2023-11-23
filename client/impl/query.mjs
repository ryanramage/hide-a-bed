// @ts-check

import { z } from 'zod' // eslint-disable-line
import needle from 'needle'
import { SimpleViewQuery, SimpleViewQueryResponse } from '../schema/query.mjs' // eslint-disable-line

import pkg from 'lodash'
const { includes } = pkg

/** @type { z.infer<SimpleViewQuery> } query */
export const query = SimpleViewQuery.implement(async (config, view, options) => {
  // @ts-ignore
  const qs = queryString(options, ['key', 'startkey', 'endkey', 'reduce', 'group', 'group_level'])

  const opts = {
    json: true,
    headers: {
      'Content-Type': 'application/json'
    }
  }
  const url = `${config.couch}/${view}?${qs.toString()}`
  // @ts-ignore
  const results = await needle('get', url, opts)
  /** @type { z.infer<SimpleViewQueryResponse> } body */
  const body = results.body
  if (body.error) throw new Error(body.error)
  return body
})

function queryString (options, params) {
  const parts = Object.keys(options).map(key => {
    let value = options[key]
    if (includes(params, key)) {
      if (typeof value === 'string') value = `"${value}"`
      if (Array.isArray(value)) {
        value = '[' + value.map(i => {
          if (typeof i === 'string') return `"${i}"`
          return i
        }).join(',') + ']'
      }
    }
    return `${key}=${value}`
  })
  return parts.join('&')
}
