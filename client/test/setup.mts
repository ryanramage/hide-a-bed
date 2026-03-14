import needle from 'needle'
import { setTimeout } from 'timers/promises'
import { TEST_DB_PORT, TEST_DB_URL } from './setup-db.mts'
import { spawn } from 'child_process'

let db_server: ReturnType<typeof spawn> | null = null

export async function globalSetup() {
  console.log('Starting pouchdb-server for tests...')
  db_server = spawn(
    'node_modules/.bin/pouchdb-server',
    ['--in-memory', '--port', `${TEST_DB_PORT}`],
    { stdio: 'inherit' }
  )

  // Wait for the server to start
  await setTimeout(1000)

  // Create a test database
  await needle('put', TEST_DB_URL, null)
  await setTimeout(250)

  console.log('Pouchdb-server started and test database created.')
}

export async function globalTeardown() {
  console.log('Tearing down pouchdb-server...')

  if (db_server) {
    console.log('Stopping pouchdb-server...')
    db_server.kill()
    db_server = null
  }
  console.log('Global test teardown complete.')
}
