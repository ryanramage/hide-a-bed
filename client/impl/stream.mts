import { Readable } from 'node:stream'
import Chain from 'stream-chain'
import Parser from 'stream-json/Parser.js'
import Pick from 'stream-json/filters/Pick.js'
import StreamArray from 'stream-json/streamers/StreamArray.js'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { OperationError, RetryableError, createResponseError } from './utils/errors.mts'
import { createLogger } from './utils/logger.mts'
import { queryString } from './utils/queryString.mts'
import type { ViewRow } from '../schema/couch/couch.output.schema.ts'
import { ViewOptions } from '../schema/couch/couch.input.schema.ts'
import { fetchCouchStream } from './utils/fetch.mts'
import type { ReadableStream } from 'node:stream/web'
import { isSuccessStatusCode } from './utils/response.mts'
import { createCouchPathUrl } from './utils/url.mts'

type StreamArrayChunk<Row> = {
  key: number
  value: Row
}

export type OnRow = (row: ViewRow) => void
type HttpMethod = 'GET' | 'POST'

/**
 * Execute a CouchDB view query and stream rows as they are received.
 * @param rawConfig CouchDB configuration
 * @param view The CouchDB view to query
 * @param options Query options
 * @param onRow Callback invoked for each row received
 */
export async function queryStream(
  rawConfig: CouchConfigInput,
  view: string,
  options: ViewOptions | undefined,
  onRow: OnRow
): Promise<void> {
  return new Promise((resolve, reject) => {
    void (async () => {
      const config = CouchConfig.parse(rawConfig)
      const logger = createLogger(config)
      logger.info(`Starting view query stream: ${view}`)
      const queryOptions = ViewOptions.parse(options ?? {})
      const request = config.request
      logger.debug('Query options:', { ...queryOptions, request })

      let method: HttpMethod = 'GET'
      let payload: Record<string, unknown> | null = null
      let qs = queryString(queryOptions)
      logger.debug('Generated query string:', qs)

      if (typeof queryOptions.keys !== 'undefined') {
        const MAX_URL_LENGTH = 2000
        const keysAsString = `keys=${encodeURIComponent(JSON.stringify(queryOptions.keys))}`

        if (keysAsString.length + qs.length + 1 <= MAX_URL_LENGTH) {
          qs += (qs.length > 0 ? '&' : '') + keysAsString
        } else {
          method = 'POST'
          payload = { keys: queryOptions.keys }
        }
      }

      const url = createCouchPathUrl(view, config.couch)
      if (qs) url.search = qs

      const requestHeaders = {
        'Content-Type': 'application/json'
      }
      const abortController = new AbortController()
      const requestAbortHandler = () => {
        const reason =
          request?.signal?.reason instanceof Error
            ? request.signal.reason
            : new DOMException('The operation was aborted.', 'AbortError')
        abortController.abort(reason)
        responseStream?.destroy(reason)
        parserPipeline.destroy(reason)
        settleReject(reason)
      }

      const parserPipeline = Chain.chain([
        new Parser(),
        new Pick({ filter: 'rows' }),
        new StreamArray()
      ])

      let rowCount = 0
      let settled = false

      const settleReject = (err: unknown) => {
        if (settled) return
        settled = true
        request?.signal?.removeEventListener('abort', requestAbortHandler)
        reject(err)
      }

      const settleResolve = () => {
        if (settled) return
        settled = true
        request?.signal?.removeEventListener('abort', requestAbortHandler)
        resolve()
      }

      let responseStream: Readable | null = null

      request?.signal?.addEventListener('abort', requestAbortHandler, { once: true })

      parserPipeline.on('data', (chunk: StreamArrayChunk<ViewRow>) => {
        try {
          rowCount++
          onRow(chunk.value)
        } catch (callbackErr) {
          const error = callbackErr instanceof Error ? callbackErr : new Error(String(callbackErr))
          parserPipeline.destroy(error)
          settleReject(error)
        }
      })

      parserPipeline.on('error', (err: Error) => {
        logger.error('Stream parsing error:', err)
        parserPipeline.destroy()
        settleReject(
          new OperationError('Stream parsing failed', {
            cause: err,
            operation: 'queryStream'
          })
        )
      })

      parserPipeline.on('end', () => {
        logger.info(`Stream completed, processed ${rowCount} rows`)
        settleResolve()
      })

      try {
        const response = await fetchCouchStream({
          auth: config.auth,
          method,
          operation: 'queryStream',
          url,
          body: method === 'POST' ? payload : undefined,
          headers: requestHeaders,
          request,
          signal: abortController.signal
        })

        logger.debug(`Received response with status code: ${response.statusCode}`)

        if (RetryableError.isRetryableStatusCode(response.statusCode)) {
          logger.warn(`Retryable status code received: ${response.statusCode}`)
          abortController.abort()
          settleReject(
            new RetryableError('Stream query failed', response.statusCode, {
              operation: 'queryStream'
            })
          )
          return
        }

        if (!isSuccessStatusCode('viewStream', response.statusCode)) {
          abortController.abort()
          settleReject(
            createResponseError({
              defaultMessage: 'Stream query failed',
              operation: 'queryStream',
              statusCode: response.statusCode
            })
          )
          return
        }

        if (!response.body) {
          settleReject(new RetryableError('Stream query failed', 503, { operation: 'queryStream' }))
          return
        }

        responseStream = Readable.fromWeb(response.body as unknown as ReadableStream)

        responseStream.on('error', err => {
          logger.error('Network error during stream query:', err)
          parserPipeline.destroy(err as Error)
          try {
            RetryableError.handleNetworkError(err, 'queryStream')
          } catch (retryErr) {
            settleReject(retryErr)
            return
          }
        })

        responseStream.pipe(parserPipeline)
      } catch (err) {
        logger.error('Network error during stream query:', err)
        parserPipeline.destroy(err as Error)
        try {
          RetryableError.handleNetworkError(err, 'queryStream')
        } catch (retryErr) {
          settleReject(retryErr)
          return
        }
      }
    })()
  })
}
