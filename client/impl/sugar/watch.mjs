import needle from 'needle'
import { RetryableError } from '../errors.mjs'
import { createLogger } from '../logger.mjs'

// watch the doc for any changes
export const watchDoc = (config, docId, onChange, options = {}) => new Promise((resolve, reject) => {
  const logger = createLogger(config)
  const feed = options.feed ? options.feed : 'continuous'
  const includeDocs = options.include_docs ? options.include_docs : false

  const url = `${config.couch}/_changes?feed=${feed}&since=now&include_docs=${includeDocs}&filter=_doc_ids&doc_ids=["${docId}"]`

  const opts = {
    headers: { 'Content-Type': 'application/json' },
    parse_response: false
  }

  let buffer = ''
  const req = needle.get(url, opts)

  req.on('data', chunk => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    
    // Keep the last partial line in the buffer
    buffer = lines.pop() || ''

    // Process complete lines
    for (const line of lines) {
      if (line.trim()) {
        try {
          const change = JSON.parse(line)
          logger.debug('Change detected:', change)
          onChange(change)
        } catch (err) {
          logger.error('Error parsing change:', err, 'Line:', line)
        }
      }
    }
  })

  req.on('response', response => {
    logger.debug(`Received response with status code: ${response.statusCode}`)
    if (RetryableError.isRetryableStatusCode(response.statusCode)) {
      logger.warn(`Retryable status code received: ${response.statusCode}`)
      reject(new RetryableError('retryable error during stream query', response.statusCode))
      req.abort()
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

  req.on('end', () => {
    // Process any remaining data in buffer
    if (buffer.trim()) {
      try {
        const change = JSON.parse(buffer)
        logger.debug('Final change detected:', change)
        onChange(change)
      } catch (err) {
        logger.error('Error parsing final change:', err)
      }
    }
    logger.info('Stream completed')
    resolve(undefined)
  })
})
