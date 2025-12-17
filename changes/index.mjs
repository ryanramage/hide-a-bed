import needle from 'needle'
import { EventEmitter } from 'events'
import ChangesStream from 'changes-stream'

/**
 * @typedef {object} CouchConfig
 * @property {string} couch - Base CouchDB URL.
 * @property {Record<string, any>} [needleOpts] - Optional default options passed to needle.
 */

/**
 * @typedef {object} ChangesOptions
 * @property {'continuous'|'longpoll'} [feed]
 * @property {any} [filter]
 * @property {number} [inactivity_ms]
 * @property {number} [timeout]
 * @property {number} [requestTimeout]
 * @property {number|'now'} [since]
 * @property {number} [heartbeat]
 * @property {'main_only'|'all_docs'} [style]
 * @property {boolean} [include_docs]
 * @property {Record<string, any>} [query_params]
 * @property {boolean} [use_post]
 */

/**
 * @typedef {{
 *   seq: string | number,
 *   id: string,
 *   changes: Array<{ rev: string }>,
 *   deleted?: boolean,
 *   doc?: any
 * }} ChangeInfo
 */

/**
 * Merge global needle options from config with request specific overrides.
 * @param {CouchConfig} config
 * @param {Record<string, any>} opts
 */
function mergeNeedleOpts (config, opts) {
  if (config.needleOpts) {
    return {
      ...opts,
      ...config.needleOpts,
      headers: {
        ...(opts.headers || {}),
        ...(config.needleOpts.headers || {})
      }
    }
  }

  return opts
}

/**
 * Resolve "since" option when set to "now" by querying the database for its update sequence.
 * @param {CouchConfig} config
 * @param {Record<string, any>} opts
 */
async function resolveSinceOption (config, opts) {
  if (opts.since !== 'now') return opts

  const needleOpts = mergeNeedleOpts(config, {
    json: true,
    headers: {
      'Content-Type': 'application/json'
    }
  })

  const resp = await needle('get', config.couch, needleOpts)
  return { ...opts, since: resp.body.update_seq }
}

/**
 * Create a streaming CouchDB changes feed.
 * @param {CouchConfig} config
 * @param {(change: ChangeInfo) => void} onChange
 * @param {ChangesOptions} [options]
 * @returns {Promise<{ on: (event: string, listener: (...args: any[]) => any) => any, removeListener: (event: string, listener: (...args: any[]) => any) => any, stop: () => void }>}
 */
export async function changes (config, onChange, options = {}) {
  if (!config || typeof config.couch !== 'string') {
    throw new Error('config.couch (CouchDB base URL) is required')
  }
  if (typeof onChange !== 'function') {
    throw new TypeError('onChange callback is required')
  }

  const emitter = new EventEmitter()
  const baseOptions = await resolveSinceOption(config, { ...options })
  const feedOptions = {
    ...baseOptions,
    db: config.couch
  }

  const stream = new ChangesStream(feedOptions)

  stream.on('readable', () => {
    const change = stream.read()
    if (!change) return

    if (change.results && Array.isArray(change.results)) {
      change.results.forEach(result => emitter.emit('change', result))
      return
    }

    emitter.emit('change', change)
  })

  stream.on('error', (err) => emitter.emit('error', err))
  stream.on('end', () => emitter.emit('end'))

  emitter.on('change', onChange)

  return {
    on: (event, listener) => emitter.on(event, listener),
    removeListener: (event, listener) => emitter.removeListener(event, listener),
    stop: () => {
      stream.destroy()
      emitter.removeAllListeners()
    }
  }
}

export default changes
