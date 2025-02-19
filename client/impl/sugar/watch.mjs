import needle from 'needle'
import { EventEmitter } from 'events'
import { RetryableError } from '../errors.mjs'
import { createLogger } from '../logger.mjs'
import { WatchDocs } from '../../schema/sugar/watch.mjs'

// watch the doc for any changes
export const watchDocs = WatchDocs.implement((config, docIds, onChange, options = {}) => {
  const logger = createLogger(config)
  const feed = 'continuous'
  const includeDocs = options.include_docs ?? false
  const _docIds = Array.isArray(docIds) ? docIds : [docIds]
  if (_docIds.length === 0) throw new Error('docIds must be a non-empty array')
  if (_docIds.length > 100) throw new Error('docIds must be an array of 100 or fewer elements')
  const ids = _docIds.join('","')
  const url = `${config.couch}/_changes?feed=${feed}&since=now&include_docs=${includeDocs}&filter=_doc_ids&doc_ids=["${ids}"]`

  const opts = {
    headers: { 'Content-Type': 'application/json' },
    parse_response: false
  }

  const emitter = new EventEmitter()
  let buffer = ''
  const req = needle.get(url, opts)
  let lastSeq = null
  let stopping = false

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
          if (!change.id) return null // ignore just last_seq
          logger.debug('Change detected:', change)
          emitter.emit('change', change)
          lastSeq = change.seq || change.last_seq
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
      req.abort()
    }
  })

  req.on('error', err => {
    if (stopping) {
      logger.info('stopping in progress, ignore stream error')
      return
    }
    logger.error('Network error during stream query:', err)
    try {
      RetryableError.handleNetworkError(err)
    } catch (retryErr) {
      return
    }
  })

  req.on('end', () => {
    // Process any remaining data in buffer
    if (buffer.trim()) {
      try {
        const change = JSON.parse(buffer)
        logger.debug('Final change detected:', change)
        emitter.emit('change', change)
      } catch (err) {
        logger.error('Error parsing final change:', err)
      }
    }
    logger.info('Stream completed. Last seen seq: ', lastSeq)
    emitter.emit('end', { lastSeq })
  })

  // Bind the provided change listener
  emitter.on('change', onChange)

  return {
    on: (event, listener) => emitter.on(event, listener),
    removeListener: (event, listener) => emitter.removeListener(event, listener),
    stop: () => {
      stopping = true
      req.abort()
      emitter.removeAllListeners()
    }
  }
})
