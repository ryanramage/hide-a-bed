// @ts-check

import needle from 'needle'
import { queryString } from './query.mjs'
import { RetryableError } from './errors.mjs'
// @ts-ignore
import JSONStream from 'JSONStream'

/**
 * @param {any} config
 * @param {any} view
 * @param {any} options
 */
export const queryStream = (config, view, options) => new Promise((resolve, reject) => {
  if (!options) options = {}

  const { onRow, ...rest } = options
  const qs = queryString(rest, ['key', 'startkey', 'endkey', 'reduce', 'group', 'group_level', 'stale', 'limit'])
  const url = `${config.couch}/${view}?${qs.toString()}`
  const opts = {
    json: true,
    headers: {
      'Content-Type': 'application/json'
    },
    parse_response: false // Keep as stream
  }

  const streamer = JSONStream.parse('rows.*')
  streamer.on('data', onRow)
  streamer.on('error', err => {
    reject(new Error(`Stream parsing error: ${err.message}`))
  })
  
  const req = needle.get(url, opts)
  
  req.on('response', response => {
    if (RetryableError.isRetryableStatusCode(response.statusCode)) {
      reject(new RetryableError('retryable error during stream query', response.statusCode))
      req.destroy()
      return
    }
  })

  req.on('error', err => {
    try {
      RetryableError.handleNetworkError(err)
    } catch (retryErr) {
      reject(retryErr)
      return
    }
    reject(err)
  })

  req.pipe(streamer)
  
  streamer.on('end', () => {
    resolve(null) // all work should be done in the stream
  })
})
