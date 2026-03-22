import { EventEmitter } from 'events'
import { OperationError, RetryableError, createResponseError } from '../utils/errors.mts'
import { createLogger } from '../utils/logger.mts'
import { WatchOptions, type WatchOptionsInput } from '../../schema/sugar/watch.mts'
import { setTimeout } from 'node:timers/promises'
import { CouchConfig, type CouchConfigInput } from '../../schema/config.mts'
import { fetchCouchStream } from '../utils/fetch.mts'
import { isSuccessStatusCode } from '../utils/response.mts'
import { createCouchPathUrl } from '../utils/url.mts'

export type WatchListener = (...args: Array<unknown>) => void

export type WatchHandle = {
  on: (event: string, listener: WatchListener) => EventEmitter
  removeListener: (event: string, listener: WatchListener) => EventEmitter
  stop: () => void
}

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
): WatchHandle {
  const config = CouchConfig.parse(configInput)
  const options = WatchOptions.parse(optionsInput)
  const logger = createLogger(config)
  const emitter = new EventEmitter()
  const request = config.request
  let lastSeq: null | 'now' = null
  let stopping = false
  let stopEndEmitted = false
  let retryCount = 0
  const lifecycleAbortController = new AbortController()
  let currentAbortController: AbortController | null = null
  const maxRetries = options.maxRetries || 10
  const initialDelay = options.initialDelay || 1000
  const maxDelay = options.maxDelay || 30000

  const _docIds = Array.isArray(docIds) ? docIds : [docIds]
  if (_docIds.length === 0) {
    throw new OperationError('docIds must be a non-empty array', {
      operation: 'watchDocs'
    })
  }
  if (_docIds.length > 100) {
    throw new OperationError('docIds must be an array of 100 or fewer elements', {
      operation: 'watchDocs'
    })
  }

  const emitStopEnd = () => {
    if (stopEndEmitted) return
    stopEndEmitted = true
    emitter.emit('end', { lastSeq })
  }

  const stopWatching = () => {
    if (stopping) return
    stopping = true
    lifecycleAbortController.abort()
    currentAbortController?.abort()
    request?.signal?.removeEventListener('abort', handleExternalAbort)
    emitStopEnd()
    emitter.removeAllListeners()
  }

  const handleExternalAbort = () => {
    logger.info(`Request signal aborted, stopping watcher for [${_docIds}]`)
    stopWatching()
  }

  request?.signal?.addEventListener('abort', handleExternalAbort, { once: true })

  const connect = async () => {
    if (stopping) return

    const feed = 'continuous'
    const includeDocs = options.include_docs ?? false
    const url = createCouchPathUrl('_changes', config.couch)
    url.searchParams.set('feed', feed)
    url.searchParams.set('since', String(lastSeq))
    url.searchParams.set('include_docs', String(includeDocs))
    url.searchParams.set('filter', '_doc_ids')
    url.searchParams.set('doc_ids', JSON.stringify(_docIds))
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
        operation: 'watchDocs',
        url,
        headers: {
          'Content-Type': 'application/json'
        },
        request,
        signal: AbortSignal.any([abortController.signal, lifecycleAbortController.signal])
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

      if (!isSuccessStatusCode('changesFeed', response.statusCode)) {
        emitter.emit(
          'error',
          createResponseError({
            defaultMessage: 'Watch request failed',
            operation: 'watchDocs',
            statusCode: response.statusCode
          })
        )
        return
      }

      retryCount = 0

      if (!response.body) {
        throw new RetryableError('Watch request failed', 503, { operation: 'watchDocs' })
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
        RetryableError.handleNetworkError(err, 'watchDocs')
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
        emitter.emit(
          'error',
          new OperationError('Watch retries exhausted', {
            operation: 'watchDocs'
          })
        )
      }
      return
    }

    const delay = Math.min(initialDelay * Math.pow(2, retryCount), maxDelay)
    retryCount++

    logger.info(`Attempting to reconnect in ${delay}ms (attempt ${retryCount} of ${maxRetries})`)
    try {
      await setTimeout(delay, undefined, { signal: lifecycleAbortController.signal })
    } catch {
      return
    }

    try {
      await connect()
    } catch (err) {
      logger.error('Error during reconnection:', err)
      await handleReconnect()
    }
  }

  // Bind the provided change listener
  emitter.on('change', onChange)

  // Start initial connection
  if (request?.signal?.aborted) {
    stopWatching()
  } else {
    void connect()
  }

  return {
    on: (event: string, listener: WatchListener) => emitter.on(event, listener),
    removeListener: (event: string, listener: WatchListener) =>
      emitter.removeListener(event, listener),
    stop: stopWatching
  }
}
