// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { EventEmitter } from 'events'

export class TrackedEmitter extends EventEmitter {
  // create a constructor with some options
  constructor(options) {
    super(options)
    if (options.delay) this.delay = options.delay
  }

  emit(event, ...args) {
    const listeners = this.listeners(event)
    let completed = 0

    return new Promise(resolve => {
      if (!listeners || listeners.length === 0) {
        return resolve() // no listeners? no delay
      }
      listeners.forEach(listener => {
        listener(...args)
        completed++
        if (completed === listeners.length) {
          if (!this.delay) resolve()
          setTimeout(resolve, this.delay)
        }
      })
    })
  }
}

export const setupEmitter = config => {
  if (!config['~emitter']) return { emit: async () => {} }
  return config['~emitter']
}
