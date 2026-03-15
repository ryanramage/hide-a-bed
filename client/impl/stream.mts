import { Readable } from 'node:stream'
import Chain from 'stream-chain'
import Parser from 'stream-json/Parser.js'
import Pick from 'stream-json/filters/Pick.js'
import StreamArray from 'stream-json/streamers/StreamArray.js'
import { CouchConfig, type CouchConfigInput } from '../schema/config.mts'
import { RetryableError } from './utils/errors.mts'
import { createLogger } from './utils/logger.mts'
import { queryString } from './utils/queryString.mts'
import type { ViewRow } from '../schema/couch/couch.output.schema.ts'
import type { ViewOptions } from '../schema/couch/couch.input.schema.ts'
import { fetchCouchStream } from './utils/fetch.mts'
import type { ReadableStream } from 'node:stream/web'

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
      logger.debug('Query options:', options)

      const queryOptions: ViewOptions = options ?? {}

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

      const url = `${config.couch}/${view}?${qs}`
      const requestHeaders = {
        'Content-Type': 'application/json'
      }
      const abortController = new AbortController()

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
        reject(err)
      }

      const settleResolve = () => {
        if (settled) return
        settled = true
        resolve()
      }

      let responseStream: Readable | null = null

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
        settleReject(new Error(`Stream parsing error: ${err.message}`, { cause: err }))
      })

      parserPipeline.on('end', () => {
        logger.info(`Stream completed, processed ${rowCount} rows`)
        settleResolve()
      })

      try {
        const response = await fetchCouchStream({
          auth: config.auth,
          method,
          url,
          body: method === 'POST' ? payload : undefined,
          headers: requestHeaders,
          signal: abortController.signal
        })

        logger.debug(`Received response with status code: ${response.statusCode}`)

        if (RetryableError.isRetryableStatusCode(response.statusCode)) {
          logger.warn(`Retryable status code received: ${response.statusCode}`)
          abortController.abort()
          settleReject(
            new RetryableError('retryable error during stream query', response.statusCode)
          )
          return
        }

        if (response.statusCode !== 200) {
          abortController.abort()
          settleReject(new Error(`could not fetch (status ${response.statusCode})`))
          return
        }

        if (!response.body) {
          settleReject(new RetryableError('no response', 503))
          return
        }

        responseStream = Readable.fromWeb(response.body as unknown as ReadableStream)

        responseStream.on('error', err => {
          logger.error('Network error during stream query:', err)
          parserPipeline.destroy(err as Error)
          try {
            RetryableError.handleNetworkError(err)
          } catch (retryErr) {
            settleReject(retryErr)
            return
          } finally {
            settleReject(err)
          }
        })

        responseStream.pipe(parserPipeline)
      } catch (err) {
        logger.error('Network error during stream query:', err)
        parserPipeline.destroy(err as Error)
        try {
          RetryableError.handleNetworkError(err)
        } catch (retryErr) {
          settleReject(retryErr)
          return
        } finally {
          settleReject(err)
        }
      }
    })()
  })
}
