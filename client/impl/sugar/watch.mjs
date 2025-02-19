import needle from 'needle'
import JSONStream from 'JSONStream'
import { RetryableError } from '../errors.mjs'
import { createLogger } from '../logger.mjs'

// watch the doc for any changes
export const watchDoc = (config, docId, onChange, options = {}) => new Promise((resolve, reject) => {
  const logger = createLogger(config)
  const feed = options.feed ? options.feed : 'continuous'
  const includeDocs = options.include_docs ? options.include_docs : false

  const url = `${config.couch}/_changes?feed=${feed}&since=now&include_docs=${includeDocs}&filter=_doc_ids&doc_ids=["${docId}"]`

  const opts = {
    json: true,
    headers: { 'Content-Type': 'application/json' },
    parse_response: false // Keep as stream
  }

  const streamer = JSONStream.parse()

  streamer.on('data', /** @param {object} row */ row => {
    logger.debug('Change detected:', row)
    onChange(row)
  })

  streamer.on('error', /** @param {Error} err */ err => {
    logger.error('Stream parsing error:', err)
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
    logger.info(`Stream completed, processed rows`)
    resolve(undefined) // all work should be done in the stream
  })

  const req = needle.get(url, opts)

  req.on('response', response => {
    logger.debug(`Received response with status code: ${response.statusCode}`)
    if (RetryableError.isRetryableStatusCode(response.statusCode)) {
      logger.warn(`Retryable status code received: ${response.statusCode}`)
      reject(new RetryableError('retryable error during stream query', response.statusCode))
      // req.abort()
    }
  })

  req.on('error', err => {
    logger.error('Network error during stream query:', err)
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
