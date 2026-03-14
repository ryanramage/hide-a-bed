import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { z } from 'zod'
import { parseRows } from './parseRows.mts'

const docSchema = z.looseObject({
  _id: z.string(),
  count: z.number()
})

const keySchema = z.number()

const valueSchema = z.looseObject({
  rev: z.string()
})

suite('parseRows', () => {
  test('throws when rows is not an array', async () => {
    await assert.rejects(
      () =>
        parseRows(
          {},
          {
            docSchema,
            keySchema,
            valueSchema,
            onInvalidDoc: 'throw'
          }
        ),
      err => err instanceof Error && err.message === 'invalid rows format'
    )
  })

  test('parses rows and validates documents', async () => {
    const rows = [
      {
        id: 'doc-valid',
        key: 1,
        value: { rev: '1-abc' },
        doc: {
          _id: 'doc-valid',
          count: 42
        }
      },
      {
        id: 'doc-missing',
        key: 2,
        error: 'not_found',
        doc: null,
        value: { rev: '1-missing' }
      }
    ]

    const result = await parseRows(rows, {
      docSchema,
      keySchema,
      valueSchema,
      onInvalidDoc: 'throw'
    })

    assert.strictEqual(result.length, 2)
    const [valid, missing] = result
    assert.strictEqual(valid?.id, 'doc-valid')
    assert.strictEqual(valid?.doc?.count, 42)
    assert.strictEqual(valid?.key, 1)
    assert.strictEqual(valid?.value?.rev, '1-abc')
    assert.strictEqual(missing?.id, 'doc-missing')
    assert.strictEqual(missing?.error, 'not_found')
    assert.strictEqual(missing?.key, 2)
    assert.strictEqual(missing?.value?.rev, '1-missing')
    assert.strictEqual(missing?.doc, null)
  })

  test('skips invalid documents when requested', async () => {
    const rows = [
      {
        id: 'doc-valid',
        key: 1,
        value: { rev: '1-valid' },
        doc: {
          _id: 'doc-valid',
          count: 7
        }
      },
      {
        id: 'doc-invalid',
        key: 2,
        value: { rev: '1-invalid' },
        doc: {
          _id: 'doc-invalid',
          count: 'nope'
        }
      }
    ]

    const result = await parseRows(rows, {
      docSchema,
      keySchema,
      valueSchema,
      onInvalidDoc: 'skip'
    })

    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0]?.id, 'doc-valid')
    assert.strictEqual(result[0]?.doc?.count, 7)
    assert.strictEqual(result[0]?.key, 1)
  })

  test('throws when a document fails validation with onInvalidDoc=throw', async () => {
    const rows = [
      {
        id: 'doc-invalid',
        key: 1,
        value: { rev: '1-invalid' },
        doc: {
          _id: 'doc-invalid',
          count: 'nope'
        }
      }
    ]

    await assert.rejects(
      () =>
        parseRows(rows, {
          docSchema,
          keySchema,
          valueSchema,
          onInvalidDoc: 'throw'
        }),
      err => Array.isArray(err)
    )
  })

  test('throws when key fails validation', async () => {
    const rows = [
      {
        id: 'doc-valid',
        key: 'invalid',
        value: { rev: '1-valid' },
        doc: {
          _id: 'doc-valid',
          count: 7
        }
      }
    ]

    await assert.rejects(
      () =>
        parseRows(rows, {
          docSchema,
          keySchema,
          valueSchema,
          onInvalidDoc: 'throw'
        }),
      err => Array.isArray(err)
    )
  })

  test('throws when value fails validation', async () => {
    const rows = [
      {
        id: 'doc-valid',
        key: 1,
        value: { rev: 123 },
        doc: {
          _id: 'doc-valid',
          count: 7
        }
      }
    ]

    await assert.rejects(
      () =>
        parseRows(rows, {
          docSchema,
          keySchema,
          valueSchema,
          onInvalidDoc: 'throw'
        }),
      err => Array.isArray(err)
    )
  })
})
