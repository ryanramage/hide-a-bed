// @ts-check
import needle from 'needle'
import { EventEmitter } from 'events'
import { Changes } from '../schema/changes.mjs'
import { createLogger } from './logger.mjs'
import { sleep } from './patch.mjs'

const MAX_RETRY_DELAY = 30000 // 30 seconds

/** @type { import('../schema/changes.mjs').ChangesSchema } */
export const changes = Changes.implement((config, options = {}) => {
  const emitter = new EventEmitter()
  const logger = createLogger(config)
  let active = true
  /** @type { any } */
  let currentRequest = null

  const opts = {
    parse: true,
    json: true,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    timeout: options.requestTimeout || 2 * 60 * 1000
  }

  const params = {
    feed: 'continuous',
    heartbeat: options.heartbeat || 30000,
    style: options.style || 'main_only',
    since: options.since || 0,
    include_docs: options.include_docs || false,
    ...options.query_params
  }

  if (options.filter) {
    params.filter = options.filter
  }

  async function startFeed(retryCount = 0) {
    if (!active) return

    const url = `${config.couch}/_changes`
    const method = options.use_post ? 'post' : 'get'
    const payload = options.use_post ? params : null
    const queryParams = options.use_post ? {} : params
    
    try {
      currentRequest = needle.request(
        method,
        url,
        payload,
        { ...opts, query: queryParams }
      )

      currentRequest
        .on('data', (/** @type {string} */ data) => {
          if (!active) return
          try {
            const strData = data.toString()
            if (strData.trim()) {
              /** @type { any } */
              const change = JSON.parse(strData)
              emitter.emit('change', change)
            }
          } catch (err) {
            logger.error('Error parsing changes feed data:', err)
          }
        })
        .on('error', async (/** @type {any} */ err) => {
          if (!active) return
          logger.error('Changes feed error:', err)
          
          const delay = Math.min(Math.pow(2, retryCount) * 1000, MAX_RETRY_DELAY)
          await sleep(delay)
          startFeed(retryCount + 1)
        })
        .on('end', () => {
          if (!active) return
          logger.info('Changes feed ended, restarting...')
          startFeed(retryCount + 1)
        })
    } catch (err) {
      logger.error('Error starting changes feed:', err)
      if (active) {
        const delay = Math.min(Math.pow(2, retryCount) * 1000, MAX_RETRY_DELAY)
        await sleep(delay)
        startFeed(retryCount + 1)
      }
    }
  }

  startFeed()

  return {
    on: (event, listener) => emitter.on(event, listener),
    removeListener: (event, listener) => emitter.removeListener(event, listener),
    stop: () => {
      active = false
      if (currentRequest) {
        currentRequest.destroy()
      }
      emitter.removeAllListeners()
    }
  }
})
