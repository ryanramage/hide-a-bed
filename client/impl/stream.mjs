// @ts-check
import needle from 'needle'
import { CouchConfig } from '../schema/config.mjs'
import { queryString } from './query.mjs'
import { RetryableError } from './errors.mjs'
import { createLogger } from './logger.mjs'
// @ts-ignore
import JSONStream from 'JSONStream'

/** @type { import('../schema/stream.mjs').SimpleViewQueryStreamSchema } queryStream */
export const queryStream = (rawConfig, view, options, onRow) => new Promise((resolve, reject) => {
  const config = CouchConfig.parse(rawConfig)
  const logger = createLogger(config)
  if (!options) options = {}

  const qs = queryString(options, ['key', 'startkey', 'endkey', 'reduce', 'group', 'group_level', 'stale', 'limit'])
  const url = `${config.couch}/${view}?${qs.toString()}`
  const opts = {
    json: true,
    headers: {
      'Content-Type': 'application/json'
    },
    parse_response: false // Keep as stream
  }

  const streamer = JSONStream.parse('rows.*')

  let rowCount = 0
  streamer.on('data', /** @param {object} row */ row => {
    rowCount++
    onRow(row)
  })

  streamer.on('error', /** @param {Error} err */ err => {
    reject(new Error(`Stream parsing error: ${err.message}`))
  })

  streamer.on('done', /** @param {Error|null} err */ err => {
    try {
      RetryableError.handleNetworkError(err)
    } catch (e) {
      reject(e)
    }
  })

  streamer.on('end', () => {
    resolve(undefined) // all work should be done in the stream
  })

  const req = needle.get(url, opts)

  req.on('response', response => {
    if (RetryableError.isRetryableStatusCode(response.statusCode)) {
      reject(new RetryableError('retryable error during stream query', response.statusCode))
      // req.abort()
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
})
