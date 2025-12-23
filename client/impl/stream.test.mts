import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { queryStream } from './stream.mts'
import { bindConfig } from './bindConfig.mts'

const startServer = async (handler: Parameters<typeof createServer>[0]) => {
  const server = createServer(handler)
  await new Promise<void>(resolve => server.listen(0, resolve))
  return server
}

suite('queryStream', () => {
  test('queryStream streams rows from chunked response', async t => {
    const expectedRows = [
      { id: 'row-1', key: 'row-1', value: { count: 1 } },
      { id: 'row-2', key: 'row-2', value: { count: 2 } }
    ]

    // @ts-expect-error testing server
    const server = await startServer((req, res) => {
      res.on('error', () => {})
      const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host}`)
      assert.strictEqual(req.method, 'GET')
      assert.strictEqual(requestUrl.pathname, '/_design/demo/_view/by-key')

      res.writeHead(200, { 'Content-Type': 'application/json' })
      const payload = JSON.stringify({
        total_rows: expectedRows.length,
        rows: expectedRows
      })
      const chunkSize = 7
      for (let i = 0; i < payload.length; i += chunkSize) {
        res.write(payload.slice(i, i + chunkSize))
      }
      res.end()
    })

    t.after(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()))
    })

    const { port } = server.address() as AddressInfo
    const rows: unknown[] = []

    await queryStream(
      { couch: `http://127.0.0.1:${port}` },
      '_design/demo/_view/by-key',
      {},
      row => {
        const matchedRow = expectedRows.find(r => r.id === row.id)
        assert.ok(matchedRow)
        assert.deepStrictEqual(row, matchedRow)
        rows.push(row)
      }
    )

    assert.deepStrictEqual(rows, expectedRows)
  })

  test('queryStream works with bindConfig', async t => {
    const expectedRows = [
      { id: 'row-1', key: 'row-1', value: { count: 1 } },
      { id: 'row-2', key: 'row-2', value: { count: 2 } }
    ]

    // @ts-expect-error testing server
    const server = await startServer((req, res) => {
      res.on('error', () => {})
      const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host}`)
      assert.strictEqual(req.method, 'GET')
      assert.strictEqual(requestUrl.pathname, '/_design/demo/_view/by-key')

      res.writeHead(200, { 'Content-Type': 'application/json' })
      const payload = JSON.stringify({
        total_rows: expectedRows.length,
        rows: expectedRows
      })
      const chunkSize = 7
      for (let i = 0; i < payload.length; i += chunkSize) {
        res.write(payload.slice(i, i + chunkSize))
      }
      res.end()
    })

    t.after(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()))
    })

    const { port } = server.address() as AddressInfo

    const rows: unknown[] = []

    const db = bindConfig({ couch: `http://127.0.0.1:${port}` })

    await db.queryStream('_design/demo/_view/by-key', {}, row => {
      const matchedRow = expectedRows.find(r => r.id === row.id)
      assert.ok(matchedRow)
      assert.deepStrictEqual(row, matchedRow)
      rows.push(row)
    })

    assert.deepStrictEqual(rows, expectedRows)
  })

  test('queryStream works with options chaining', async t => {
    const expectedRows = [
      { id: 'row-1', key: 'row-1', value: { count: 1 } },
      { id: 'row-2', key: 'row-2', value: { count: 2 } }
    ]

    // @ts-expect-error testing server
    const server = await startServer((req, res) => {
      res.on('error', () => {})
      const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host}`)
      assert.strictEqual(req.method, 'GET')
      assert.strictEqual(requestUrl.pathname, '/_design/demo/_view/by-key')

      res.writeHead(200, { 'Content-Type': 'application/json' })
      const payload = JSON.stringify({
        total_rows: expectedRows.length,
        rows: expectedRows
      })
      const chunkSize = 7
      for (let i = 0; i < payload.length; i += chunkSize) {
        res.write(payload.slice(i, i + chunkSize))
      }
      res.end()
    })

    t.after(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()))
    })

    const { port } = server.address() as AddressInfo
    const rows: unknown[] = []

    const db = bindConfig({ couch: `http://127.0.0.1:${port}` })

    await db.options({ logger: console }).queryStream('_design/demo/_view/by-key', {}, row => {
      const matchedRow = expectedRows.find(r => r.id === row.id)
      assert.ok(matchedRow)
      assert.deepStrictEqual(row, matchedRow)
      rows.push(row)
    })

    assert.deepStrictEqual(rows, expectedRows)
  })

  test('queryStream handles empty result sets', async t => {
    // @ts-expect-error testing server
    const server = await startServer((_, res) => {
      res.on('error', () => {})
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write('{"rows":[]}')
      res.end()
    })

    t.after(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()))
    })

    const { port } = server.address() as AddressInfo
    let rowCount = 0

    await queryStream(
      { couch: `http://127.0.0.1:${port}` },
      '_design/demo/_view/by-key',
      {},
      () => {
        rowCount++
      }
    )

    assert.strictEqual(rowCount, 0)
  })

  test('queryStream rejects when row handler throws', async t => {
    // @ts-expect-error testing server
    const server = await startServer((_, res) => {
      res.on('error', () => {})
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write('{"rows":[{"id":"broken","value":42}]}')
      res.end()
    })

    t.after(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()))
    })

    const { port } = server.address() as AddressInfo
    const handlerError = new Error('row-failure')

    await assert.rejects(
      queryStream({ couch: `http://127.0.0.1:${port}` }, '_design/demo/_view/error', {}, () => {
        throw handlerError
      }),
      error => {
        assert.strictEqual(error, handlerError)
        return true
      }
    )
  })
})
