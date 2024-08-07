// @ts-check

import needle from 'needle'
import { queryString } from './query.mjs'
import JSONStream from 'JSONStream'

export const queryStream = (config, view, options) => new Promise((resolve, reject) => {
  if (!options) options = {}

  const { onRow, ...rest } = options
  const qs = queryString(rest, ['key', 'startkey', 'endkey', 'reduce', 'group', 'group_level', 'stale', 'limit'])
  const url = `${config.couch}/${view}?${qs.toString()}`
  const streamer = JSONStream.parse('rows.*')
  streamer.on('data', onRow)
  streamer.on('end', (err) => {
    if (err) return reject(err)
    resolve(null) // all work should be done in the stream
  })
  needle.get(url).pipe(streamer)
})
