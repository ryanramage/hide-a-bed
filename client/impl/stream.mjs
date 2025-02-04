// @ts-check

import needle from 'needle'
import { queryString } from './query.mjs'
// @ts-ignore
import JSONStream from 'JSONStream'

/**
 * @param {any} config
 * @param {any} view
 * @param {any} options
 */
export const queryStream = (config, view, options) => new Promise((resolve, reject) => {
  if (!options) options = {}

  const { onRow, ...rest } = options
  const qs = queryString(rest, ['key', 'startkey', 'endkey', 'reduce', 'group', 'group_level', 'stale', 'limit'])
  const url = `${config.couch}/${view}?${qs.toString()}`
  const streamer = JSONStream.parse('rows.*')
  streamer.on('data', onRow)
  /**
   * @param {Error} err
   */
  streamer.on('end', (err) => {
    if (err) return reject(err)
    resolve(null) // all work should be done in the stream
  })
  needle.get(url).pipe(streamer)
})
