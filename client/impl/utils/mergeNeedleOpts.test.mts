import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { mergeNeedleOpts } from './mergeNeedleOpts.mts'
import type { CouchConfigInput } from '../../schema/config.mts'
import type { NeedleBaseOptionsSchema } from '../../schema/config.mts'

const baseOptions: NeedleBaseOptionsSchema = {
  json: true,
  headers: {
    accept: 'application/json',
    'x-request-id': 'base'
  }
}

suite('mergeNeedleOpts', () => {
  test('returns original options when no config overrides are present', () => {
    const options = mergeNeedleOpts({ couch: 'http://localhost:5984' }, baseOptions)

    assert.deepStrictEqual(options, baseOptions)
  })

  test('merges config needle options while preserving base headers', () => {
    const config: CouchConfigInput = {
      couch: 'http://localhost:5984',
      needleOpts: {
        timeout: 5000,
        parse_response: true,
        headers: {
          authorization: 'Bearer test-token',
          'x-request-id': 'override'
        }
      }
    }

    const options = mergeNeedleOpts(config, baseOptions)

    assert.deepStrictEqual(options, {
      json: true,
      timeout: 5000,
      parse_response: true,
      headers: {
        accept: 'application/json',
        authorization: 'Bearer test-token',
        'x-request-id': 'override'
      }
    })
  })
})
