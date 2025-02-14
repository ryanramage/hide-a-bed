// @ts-check
import needle from 'needle'
import { EventEmitter } from 'events'
import { Changes } from '../schema/changes.mjs'
import ChangesStream from 'changes-stream'
import { createLogger } from './logger.mjs'
import { sleep } from './patch.mjs'

const MAX_RETRY_DELAY = 30000 // 30 seconds

/** @type { import('../schema/changes.mjs').ChangesSchema } */
export const changes = Changes.implement(async (config, options = {}) => {
  const emitter = new EventEmitter()
  const logger = createLogger(config)
  options.db = config.couch
  if (options.since && options.since === 'now') {
    const opts = {
      json: true,
      headers: {
        'Content-Type': 'application/json'
      }
    }
    // request the GET on config.couch and get the update_seq
    const resp = await needle('get', config.couch, opts)
    options.since = resp.body.update_seq
  }

  const changes = new ChangesStream(options)

  changes.on('readable', () => {
    const change = changes.read();
    console.log('got a change', change)
    emitter.emit('change', change)
  });

  return {
    on: (event, listener) => emitter.on(event, listener),
    removeListener: (event, listener) => emitter.removeListener(event, listener),
    stop: () => {
      changes.destroy()
      emitter.removeAllListeners()
    }
  }
})
