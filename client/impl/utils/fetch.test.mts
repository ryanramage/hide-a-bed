import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test, { suite } from 'node:test'
import { fetchCouchJson } from './fetch.mts'

type ServerDetails = {
  close: () => Promise<void>
  url: string
}

async function withAuthEchoServer(run: (server: ServerDetails) => Promise<void>) {
  const server = createServer((req, res) => {
    const auth = req.headers.authorization ?? null

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        auth,
        url: req.url
      })
    )
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected tcp server address')
  }

  const details: ServerDetails = {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(err => {
          if (err) reject(err)
          else resolve()
        })
      }),
    url: `http://127.0.0.1:${address.port}/db`
  }

  try {
    await run(details)
  } finally {
    await details.close()
  }
}

suite('fetchCouchJson auth', () => {
  test('adds basic auth from explicit config auth', async () => {
    await withAuthEchoServer(async server => {
      const response = await fetchCouchJson<{
        auth: string
        url: string
      }>({
        auth: {
          username: 'config-user',
          password: 'config-pass'
        },
        method: 'GET',
        url: server.url
      })

      assert.strictEqual(
        response.body.auth,
        `Basic ${Buffer.from('config-user:config-pass').toString('base64')}`
      )
      assert.strictEqual(response.body.url, '/db')
    })
  })
})
