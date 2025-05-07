// @ts-check
import needle from 'needle'
import { EventEmitter } from 'events'
import { Changes } from '../schema/changes.mjs'

/** @typedef {{
 *   seq: string|number,
 *   id: string,
 *   changes: Array<{rev: string}>,
 *   deleted?: boolean,
 *   doc?: any
 * }} ChangeInfo */
// @ts-ignore
import ChangesStream from 'changes-stream'

/** @type { import('../schema/changes.mjs').ChangesSchema } */
export const changes = Changes.implement(async (config, onChange, options = {}) => {
  const emitter = new EventEmitter()
  options.db = config.couch
  if (options.since && options.since === 'now') {
    const opts = {
      ...(config.needle || {}),
      json: true,
      headers: {
        ...config.needle?.headers,
        'Content-Type': 'application/json'
      }
    }
    // request the GET on config.couch and get the update_seq
    const resp = await needle('get', config.couch, opts)
    options.since = resp.body.update_seq
  }

  const changes = ChangesStream(options)

  changes.on('readable', () => {
    const change = changes.read()
    if (change.results && Array.isArray(change.results)) {
      // emit each one seperate
      change.results.forEach((/** @type {ChangeInfo} */ c) => emitter.emit('change', c))
    } else emitter.emit('change', change)
  })

  // Bind the provided change listener
  emitter.on('change', onChange)

  return {
    on: (event, listener) => emitter.on(event, listener),
    removeListener: (event, listener) => emitter.removeListener(event, listener),
    stop: () => {
      changes.destroy()
      emitter.removeAllListeners()
    }
  }
})
