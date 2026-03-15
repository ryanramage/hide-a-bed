import { EventEmitter } from 'events'
import { RetryableError } from '../utils/errors.mts'
import { createLogger } from '../utils/logger.mts'
import { WatchOptions, type WatchOptionsInput } from '../../schema/sugar/watch.mts'
import { setTimeout } from 'node:timers/promises'
import { CouchConfig, type CouchConfigInput } from '../../schema/config.mts'
import { fetchCouchStream } from '../utils/fetch.mts'

/**
 * Watch for changes to specified document IDs in CouchDB.
 * Calls the onChange callback for each change detected.
 * Returns an emitter with methods to listen for events and stop watching.
 *
 * @param configInput CouchDB configuration
 * @param docIds Document ID or array of document IDs to watch
 * @param onChange Callback function called on each change
 * @param optionsInput Watch options
 *
 * @return WatchEmitter with methods to manage the watch
 */
export function watchDocs(
  configInput: CouchConfigInput,
  docIds: string | string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (change: any) => void,
  optionsInput: WatchOptionsInput = {}
) {
  const config = CouchConfig.parse(configInput)
  const options = WatchOptions.parse(optionsInput)
  const logger = createLogger(config)
  const emitter = new EventEmitter()
  let lastSeq: null | 'now' = null
  let stopping = false
  let retryCount = 0
  let currentAbortController: AbortController | null = null
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
    const abortController = new AbortController()
    currentAbortController = abortController

    let buffer = ''
    const processLine = (line: string) => {
      if (!line.trim()) return

      try {
        const change = JSON.parse(line)
        if (!change.id) return
        logger.debug(`Change detected, watching [${_docIds}]`, change)
        lastSeq = change.seq || change.last_seq
        emitter.emit('change', change)
      } catch (err) {
        logger.error('Error parsing change:', err, 'Line:', line)
      }
    }

    try {
      const response = await fetchCouchStream({
        auth: config.auth,
        method: 'GET',
        url,
        headers: {
          'Content-Type': 'application/json'
        },
        signal: abortController.signal
      })

      logger.debug(
        `Received response with status code, watching [${_docIds}]: ${response.statusCode}`
      )
      if (RetryableError.isRetryableStatusCode(response.statusCode)) {
        logger.warn(`Retryable status code received: ${response.statusCode}`)
        abortController.abort()
        await handleReconnect()
        return
      }

      if (response.statusCode !== 200) {
        emitter.emit('error', new Error(`Unexpected status code: ${response.statusCode}`))
        return
      }

      retryCount = 0

      if (!response.body) {
        throw new RetryableError('no response', 503)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (!stopping) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        lines.forEach(processLine)
      }

      if (stopping || abortController.signal.aborted) {
        return
      }

      buffer += decoder.decode()

      if (buffer.trim()) {
        processLine(buffer)
      }

      logger.info('Stream completed. Last seen seq: ', lastSeq)
      emitter.emit('end', { lastSeq })

      if (!stopping) {
        await handleReconnect()
      }
    } catch (err) {
      if (stopping || abortController.signal.aborted) {
        logger.info('stopping in progress, ignore stream error')
        return
      }

      logger.error(`Network error during stream, watching [${_docIds}]:`, String(err))
      try {
        RetryableError.handleNetworkError(err)
      } catch (filteredError) {
        if (filteredError instanceof RetryableError) {
          logger.info(`Retryable error, watching [${_docIds}]:`, filteredError.toString())
          await handleReconnect()
        } else {
          logger.error(`Non-retryable error, watching [${_docIds}]`, String(filteredError))
          emitter.emit('error', filteredError)
        }
      }
    }
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
    await setTimeout(delay)

    try {
      await connect()
    } catch (err) {
      logger.error('Error during reconnection:', err)
      await handleReconnect()
    }
  }

  // Start initial connection
  void connect()

  // Bind the provided change listener
  emitter.on('change', onChange)

  return {
    on: (event: string, listener: EventListener) => emitter.on(event, listener),
    removeListener: (event: string, listener: EventListener) =>
      emitter.removeListener(event, listener),
    stop: () => {
      stopping = true
      currentAbortController?.abort()
      emitter.emit('end', { lastSeq })
      emitter.removeAllListeners()
    }
  }
}
