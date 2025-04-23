import needle from 'needle'
import { EventEmitter } from 'events'
import { RetryableError } from '../errors.mjs'
import { createLogger } from '../logger.mjs'
import { sleep } from '../patch.mjs'
import { WatchDocs } from '../../schema/sugar/watch.mjs'

// watch the doc for any changes
export const watchDocs = WatchDocs.implement((config, docIds, onChange, options = {}) => {
  const logger = createLogger(config)
  const emitter = new EventEmitter()
  let lastSeq = null || 'now'
  let stopping = false
  let retryCount = 0
  let currentRequest = null
  const maxRetries = options.maxRetries || 10
  const initialDelay = options.initialDelay || 1000
  const maxDelay = options.maxDelay || 30000

  const _docIds = Array.isArray(docIds) ? docIds : [docIds]
  if (_docIds.length === 0) throw new Error('docIds must be a non-empty array')
  if (_docIds.length > 100) throw new Error('docIds must be an array of 100 or fewer elements')

  const connect = async () => {
    if (stopping) return

    const feed = 'continuous'
    const includeDocs = options.include_docs ?? false
    const ids = _docIds.join('","')
    const url = `${config.couch}/_changes?feed=${feed}&since=${lastSeq}&include_docs=${includeDocs}&filter=_doc_ids&doc_ids=["${ids}"]`

    const opts = {
      headers: { 'Content-Type': 'application/json' },
      parse_response: false,
      open_timeout: config.openTimeout,
      response_timeout: config.responseTimeout,
      read_timeout: config.readTimeout
    }

    let buffer = ''
    currentRequest = needle.get(url, opts)

    currentRequest.on('data', chunk => {
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
            logger.debug(`Change detected, watching [${_docIds}]`, change)
            lastSeq = change.seq || change.last_seq
            emitter.emit('change', change)
          } catch (err) {
            logger.error('Error parsing change:', err, 'Line:', line)
          }
        }
      }
    })

    currentRequest.on('response', response => {
      logger.debug(`Received response with status code, watching [${_docIds}]: ${response.statusCode}`)
      if (RetryableError.isRetryableStatusCode(response.statusCode)) {
        logger.warn(`Retryable status code received: ${response.statusCode}`)
        currentRequest.abort()
        handleReconnect()
      } else {
      // Reset retry count on successful connection
        retryCount = 0
      }
    })

    currentRequest.on('error', async err => {
      if (stopping) {
        logger.info('stopping in progress, ignore stream error')
        return
      }
      logger.error(`Network error during stream, watching [${_docIds}]:`, err.toString())
      try {
        RetryableError.handleNetworkError(err)
      } catch (filteredError) {
        if (filteredError instanceof RetryableError) {
          logger.info(`Retryable error, watching [${_docIds}]:`, filteredError.toString())
          handleReconnect()
        } else {
          logger.error(`Non-retryable error, watching [${_docIds}]`, filteredError.toString())
          emitter.emit('error', filteredError)
        }
      }
    })

    currentRequest.on('end', () => {
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

      // If the stream ends and we're not stopping, attempt to reconnect
      if (!stopping) {
        handleReconnect()
      }
    })
  }

  const handleReconnect = async () => {
    if (stopping || retryCount >= maxRetries) {
      if (retryCount >= maxRetries) {
        logger.error(`Max retries (${maxRetries}) reached, giving up`)
        emitter.emit('error', new Error('Max retries reached'))
      }
      return
    }

    const delay = Math.min(initialDelay * Math.pow(2, retryCount), maxDelay)
    retryCount++

    logger.info(`Attempting to reconnect in ${delay}ms (attempt ${retryCount} of ${maxRetries})`)
    await sleep(delay)

    try {
      connect()
    } catch (err) {
      logger.error('Error during reconnection:', err)
      handleReconnect()
    }
  }

  // Start initial connection
  connect()

  // Bind the provided change listener
  emitter.on('change', onChange)

  return {
    on: (event, listener) => emitter.on(event, listener),
    removeListener: (event, listener) => emitter.removeListener(event, listener),
    stop: () => {
      stopping = true
      if (currentRequest) currentRequest.abort()
      emitter.emit('end', { lastSeq })
      emitter.removeAllListeners()
    }
  }
})
