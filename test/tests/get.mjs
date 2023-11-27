import t from 'tap'
import * as db from 'hide-a-bed'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

const config = { couch: 'http://localhost:5555' } // not a real couch
const server = setupServer(
  http.get('http://localhost:5555/test-doc-id', (req, res, ctx) => {
    return HttpResponse.json({
      _id: 'test-doc-id',
      _rev: '1-234',
      foo: 'bar'
    })
  })
)
t.before(() => {
  server.listen()
})

t.beforeEach(() => {
  server.resetHandlers()
})

t.test('test a doc get', async t => {
  const doc = await db.get(config, 'test-doc-id')
  t.equal(doc._id, 'test-doc-id', 'doc id is correct')
})

t.test('when a doc is not found', async t => {
  server.use(
    http.get('http://localhost:5555/does-no-exist', () => new HttpResponse(null, { status: 404}))
  )
  try {
    const doc = await db.get(config, 'does-no-exist')
    t.fail('should have thrown an error')

  } catch (e) {
    t.ok(e, 'threw an error')
  }
})

t.after(() => {
  server.close()
})
