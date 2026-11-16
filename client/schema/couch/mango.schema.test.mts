import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import {
  MangoQuerySchema,
  createMangoResponseSchema,
  type MangoQuery,
  type MangoResponse
} from './mango.schema.ts'

test('Mango query schemas accept CouchDB options and reject misspelled/invalid options', () => {
  const query: MangoQuery = {
    selector: { $or: [{ type: 'job' }, { active: true }] },
    skip: 0,
    conflicts: false,
    r: 1,
    update: false,
    stable: true,
    stale: 'ok'
  }
  assert.deepEqual(MangoQuerySchema.parse(query), query)
  for (const invalid of [
    { selector: {}, skipp: 1 },
    { selector: {}, skip: -1 },
    { selector: {}, r: 0 },
    { selector: {}, sort: [{ title: 'nearest' }] }
  ]) {
    assert.equal(MangoQuerySchema.safeParse(invalid).success, false)
  }
})

test('response factory validates projected docs and named execution statistics', () => {
  const schema = createMangoResponseSchema(z.object({ title: z.string() }))
  const response: MangoResponse<{ title: string }> = {
    docs: [{ title: 'Agent' }],
    bookmark: 'next',
    warning: 'index warning',
    execution_stats: {
      total_keys_examined: 2,
      total_docs_examined: 1,
      total_quorum_docs_examined: 0,
      results_returned: 1,
      execution_time_ms: 0.25
    }
  }
  assert.deepEqual(schema.parse(response), response)
  assert.equal(schema.safeParse({ ...response, docs: [{ title: 1 }] }).success, false)
  assert.equal(
    schema.safeParse({
      ...response,
      execution_stats: { ...response.execution_stats, results_returned: '1' }
    }).success,
    false
  )
})
