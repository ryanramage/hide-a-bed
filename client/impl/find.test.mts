import assert from 'node:assert/strict'
import test from 'node:test'
import { find } from './find.mts'
import { bindConfig } from './bindConfig.mts'

test('bound find preserves Mango metadata, auth and request controls', async (t) => {
  const controller = new AbortController()
  const payload = {
    docs: [{ _id: 'nearby' }],
    bookmark: 'next',
    execution_stats: { total_keys_examined: 2 }
  }
  t.mock.method(globalThis, 'fetch', async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    assert.equal(String(url), 'http://localhost:5984/jobs/_find')
    assert.equal(init?.method, 'POST')
    assert.ok(init?.signal)
    assert.equal(new Headers(init?.headers).get('authorization'), 'Basic dXNlcjpwYXNz')
    assert.deepEqual(JSON.parse(String(init?.body)), { selector: { type: 'job' }, limit: 10 })
    return Response.json(payload)
  })
  const db = bindConfig({
    couch: 'http://localhost:5984/jobs',
    auth: { username: 'user', password: 'pass' },
    request: { signal: controller.signal, timeout: 1000 }
  })
  assert.deepEqual(await db.find({ selector: { type: 'job' }, limit: 10 }), payload)
})

test('find rejects invalid requests and malformed/error responses', async (t) => {
  const config = { couch: 'http://localhost:5984/jobs' }
  await assert.rejects(find(config, { selector: {}, limit: 0 }))
  const mock = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'bad_request', reason: 'invalid selector' }, { status: 400 })
  )
  await assert.rejects(find(config, { selector: {} }), { operation: 'find', statusCode: 400 })
  mock.mock.mockImplementation(async () => Response.json({ bookmark: 'bad' }))
  await assert.rejects(find(config, { selector: {} }), /missing docs/)
})

test('bound find retries transient failures and options overrides remain available', async (t) => {
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
