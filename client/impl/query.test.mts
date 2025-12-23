import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import needle from 'needle'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { z, ZodError } from 'zod'

import type { CouchConfigInput } from '../schema/config.mts'
import { TEST_DB_URL } from '../test/setup-db.mts'
import { query } from './query.mts'
import { RetryableError } from './utils/errors.mts'

const config: CouchConfigInput = {
  couch: TEST_DB_URL
}

async function putDoc(doc: Record<string, unknown> & { _id: string }) {
  await needle('put', `${TEST_DB_URL}/${doc._id}`, doc, { json: true })
}

async function putDesignDoc(id: string, viewName: string, mapFn: string) {
  await needle(
    'put',
    `${TEST_DB_URL}/_design/${id}`,
    {
      views: {
        [viewName]: {
          map: mapFn
        }
      }
    },
    { json: true }
  )
}

async function eventually<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  attempts = 10,
  waitMs = 100
): Promise<T> {
  let lastValue: T | undefined
  for (let attempt = 0; attempt < attempts; attempt++) {
    lastValue = await fn()
    if (predicate(lastValue)) return lastValue
    await delay(waitMs)
  }
  return lastValue!
}

suite('query', () => {
  test('returns rows with include_docs', async () => {
    const designId = `query-view-${randomUUID()}`
    const viewName = 'byCategory'
    const tag = `query-suite-${randomUUID()}`
    await putDesignDoc(
      designId,
      viewName,
      `function(doc) { if (doc.tag !== '${tag}') return; emit(doc.category, doc.count); }`
    )

    const matchingDoc = {
      _id: `doc-${randomUUID()}`,
      tag,
      category: 'keep',
      count: 42
    }
    const otherDoc = {
      _id: `doc-${randomUUID()}`,
      tag,
      category: 'skip',
      count: 1
    }
    const unrelatedDoc = {
      _id: `doc-${randomUUID()}`,
      tag: 'other',
      category: 'keep',
      count: 100
    }

    await putDoc(matchingDoc)
    await putDoc(otherDoc)
    await putDoc(unrelatedDoc)

    const response = await eventually(
      () =>
        query(config, `_design/${designId}/_view/${viewName}`, {
          include_docs: true,
          key: matchingDoc.category
        }),
      ({ rows }) => rows?.length === 1
    )

    if (!response.rows) {
      throw new Error('Expected rows in response')
    }

    assert.strictEqual(response.rows[0].key, matchingDoc.category)
    assert.strictEqual(response.rows[0].value, matchingDoc.count)
    assert.strictEqual(response.rows[0].doc?._id, matchingDoc._id)
  })

  test('validates rows when schemas provided', async () => {
    const designId = `query-validate-${randomUUID()}`
    const viewName = 'byPlayer'
    const tag = `query-suite-${randomUUID()}`
    await putDesignDoc(
      designId,
      viewName,
      `function(doc) { if (doc.tag !== '${tag}') return; emit(doc.player, doc.score); }`
    )

    const doc = { _id: `doc-${randomUUID()}`, tag, player: 'alpha', score: 7 }
    await putDoc(doc)

    const response = await eventually(
      () =>
        query(config, `_design/${designId}/_view/${viewName}`, {
          include_docs: true,
          key: doc.player,
          validate: {
            docSchema: z.looseObject({
              _id: z.string(),
              tag: z.string(),
              player: z.string(),
              score: z.number()
            }),
            keySchema: z.string(),
            valueSchema: z.number()
          }
        }),
      ({ rows }) => rows.length === 1
    )

    assert.strictEqual(response.rows[0]?.value, doc.score)
    assert.strictEqual(response.rows[0]?.doc?.player, doc.player)
  })

  test('rejects when validation fails', async () => {
    const designId = `query-invalid-${randomUUID()}`
    const viewName = 'byPlayer'
    const tag = `query-suite-${randomUUID()}`
    await putDesignDoc(
      designId,
      viewName,
      `function(doc) { if (doc.tag !== '${tag}') return; emit(doc.player, doc.score); }`
    )

    const validDoc = {
      _id: `doc-${randomUUID()}`,
      tag,
      player: 'valid',
      score: 3
    }
    const invalidDoc = {
      _id: `doc-${randomUUID()}`,
      tag,
      player: 'invalid',
      score: 'nope'
    }

    await putDoc(validDoc)
    await putDoc(invalidDoc)

    await eventually(
      () =>
        query(config, `_design/${designId}/_view/${viewName}`, {
          key: validDoc.player
        }),
      ({ rows }) => rows?.length === 1
    )

    await assert.rejects(
      () =>
        query(config, `_design/${designId}/_view/${viewName}`, {
          validate: {
            valueSchema: z.number()
          }
        }),
      (err: unknown) => err instanceof ZodError
    )
  })

  test('posts payload when keys exceed URL limit', async () => {
    const designId = `query-post-${randomUUID()}`
    const viewName = 'byPlayer'
    const tag = `query-suite-${randomUUID()}`
    await putDesignDoc(
      designId,
      viewName,
      `function(doc) { if (doc.tag !== '${tag}') return; emit(doc.player, doc.score); }`
    )

    const targetDoc = {
      _id: `doc-${randomUUID()}`,
      tag,
      player: 'target',
      score: 11
    }
    await putDoc(targetDoc)

    await eventually(
      () =>
        query(config, `_design/${designId}/_view/${viewName}`, {
          key: targetDoc.player
        }),
      ({ rows }) => rows?.length === 1
    )

    const bulkKeys = Array.from({ length: 400 }, (_, index) => `missing-${index}-${randomUUID()}`)
    bulkKeys.push(targetDoc.player)

    const response = await query(config, `_design/${designId}/_view/${viewName}`, {
      include_docs: true,
      keys: bulkKeys
    })

    if (!response.rows) throw new Error('Expected rows in response')
    assert.strictEqual(response.rows.length, 1)
    assert.strictEqual(response.rows[0]?.key, targetDoc.player)
    assert.strictEqual(response.rows[0]?.doc?._id, targetDoc._id)
  })

  test('throws RetryableError on network failure', async () => {
    const offlineConfig: CouchConfigInput = {
      couch: 'http://localhost:6553/offline-db'
    }

    await assert.rejects(
      () => query(offlineConfig, '_all_docs', {}),
      (err: unknown) => err instanceof RetryableError && err.statusCode === 503
    )
  })
})
