// @ts-check
import needle from 'needle'
import { queryString } from './query.mjs'
import { RetryableError } from './errors.mjs'
import { createLogger } from './logger.mjs'
// @ts-ignore
import JSONStream from 'JSONStream'

/** @type { import('../schema/stream.mjs').SimpleViewQueryStreamSchema } */
export const queryStream = (config, view, options, onRow) => new Promise((resolve, reject) => {
  const logger = createLogger(config)
  logger.info(`Starting stream query for view: ${view}`)
  
  if (!options) options = {}
  logger.debug('Stream query options:', options)

  const qs = queryString(options, ['key', 'startkey', 'endkey', 'reduce', 'group', 'group_level', 'stale', 'limit'])
  logger.debug('Generated query string:', qs)
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
  streamer.on('data', row => {
    rowCount++
    logger.debug(`Processing row ${rowCount}`)
    onRow(row)
  })
  
  streamer.on('error', /** @param {Error} err */ err => {
    logger.error('Stream parsing error:', err)
    reject(new Error(`Stream parsing error: ${err.message}`))
  })
  
  streamer.on('done', /** @param {Error|null} err */ err => {
    if (err) {
      logger.error('Stream done with error:', err)
    }
    try {
      RetryableError.handleNetworkError(err)
    } catch (e) {
      logger.error('Retryable error in stream:', e)
      reject(e)
    }
  })
  
  streamer.on('end', () => {
    logger.info(`Stream completed successfully, processed ${rowCount} rows`)
    resolve(undefined) // all work should be done in the stream
  })
  
  const req = needle.get(url, opts)
  
  req.on('response', response => {
    logger.debug(`Received response with status code: ${response.statusCode}`)
    if (RetryableError.isRetryableStatusCode(response.statusCode)) {
      logger.warn(`Retryable status code received: ${response.statusCode}`)
      reject(new RetryableError('retryable error during stream query', response.statusCode))
      // req.abort()
      return
    }
  })

  req.on('error', err => {
    logger.error('Request error:', err)
    try {
      RetryableError.handleNetworkError(err)
    } catch (retryErr) {
      logger.error('Retryable error in request:', retryErr)
      reject(retryErr)
      return
    }
    reject(err)
  })

  req.pipe(streamer)
  
})
