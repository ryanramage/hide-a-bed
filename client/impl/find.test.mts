import assert from 'node:assert/strict'
import test from 'node:test'
import { find } from './find.mts'
import { bindConfig } from './bindConfig.mts'

test('bound find preserves Mango metadata, auth and request controls', async t => {
  const controller = new AbortController()
  const payload = {
    docs: [{ _id: 'nearby' }],
    bookmark: 'next',
    execution_stats: {
      total_keys_examined: 2,
      total_docs_examined: 1,
      total_quorum_docs_examined: 0,
      results_returned: 1,
      execution_time_ms: 0.5
    },
    warning: 'index warning'
  }
  t.mock.method(
    globalThis,
    'fetch',
    async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      assert.equal(String(url), 'http://localhost:5984/jobs/_find')
      assert.equal(init?.method, 'POST')
      assert.ok(init?.signal)
      assert.equal(new Headers(init?.headers).get('authorization'), 'Basic dXNlcjpwYXNz')
      assert.deepEqual(JSON.parse(String(init?.body)), { selector: { type: 'job' }, limit: 10 })
      return Response.json(payload)
    }
  )
  const db = bindConfig({
    couch: 'http://localhost:5984/jobs',
    auth: { username: 'user', password: 'pass' },
    request: { signal: controller.signal, timeout: 1000 }
  })
  assert.deepEqual(await db.find({ selector: { type: 'job' }, limit: 10 }), payload)
})

test('find rejects invalid requests and malformed/error responses', async t => {
  const config = { couch: 'http://localhost:5984/jobs' }
  await assert.rejects(find(config, { selector: {}, limit: 0 }))
  const mock = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'bad_request', reason: 'invalid selector' }, { status: 400 })
  )
  await assert.rejects(find(config, { selector: {} }), { operation: 'find', statusCode: 400 })
  mock.mock.mockImplementation(async () => Response.json({ bookmark: 'bad' }))
  await assert.rejects(find(config, { selector: {} }), /Invalid Mango response/)
})

test('bound find retries transient failures and options overrides remain available', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return calls === 1
      ? Response.json({ error: 'unavailable' }, { status: 503 })
      : Response.json({ docs: [] })
  })
  const db = bindConfig({ couch: 'http://localhost:5984/jobs', initialDelay: 0, maxRetries: 1 })
  assert.deepEqual(await db.options({ request: { timeout: 1000 } }).find({ selector: {} }), {
    docs: []
  })
  assert.equal(calls, 2)
})

test('find forwards the supported Mango options without dropping false or zero', async t => {
  const options = {
    selector: { $and: [{ type: 'job' }, { 'location.lat': { $gte: 0 } }] },
    skip: 0,
    limit: 25,
    sort: [{ 'location.lat': 'asc' as const }],
    fields: ['title'],
    use_index: ['_design/geo', 'by_location'] as [string, string],
    conflicts: true,
    r: 2,
    bookmark: 'next-page',
    update: false,
    stable: true,
    execution_stats: true,
    allow_fallback: false
  }
  t.mock.method(
    globalThis,
    'fetch',
    async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      assert.deepEqual(JSON.parse(String(init?.body)), options)
      return Response.json({ docs: [{ title: 'Agent' }] })
    }
  )
  const result = await find<{ title: string }>({ couch: 'http://localhost:5984/jobs' }, options)
  assert.equal(result.docs[0]?.title, 'Agent')
  const db = bindConfig({ couch: 'http://localhost:5984/jobs' })
  const bound = await db.options({ bindWithRetry: false }).find<{ title: string }>(options)
  assert.equal(bound.docs[0]?.title, 'Agent')
})
