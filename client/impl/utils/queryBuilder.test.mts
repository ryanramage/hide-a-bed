import assert from 'node:assert/strict'
import test, { suite } from 'node:test'
import { QueryBuilder, createQuery } from './queryBuilder.mts'

suite('QueryBuilder', () => {
  test('build returns populated options', () => {
    const options = new QueryBuilder()
      .descending(false)
      .endkey_docid('end-doc')
      .endkey(['range-end'])
      .group(false)
      .group_level(2)
      .include_docs(true)
      .inclusive_end(false)
      .key('primary')
      .keys(['k1', { foo: 'bar' }])
      .limit(10)
      .reduce(false)
      .skip(5)
      .sorted(false)
      .stable(true)
      .startkey(['range-start'])
      .startkey_docid('start-doc')
      .update('lazy')
      .update_seq(true)
      .build()

    assert.deepStrictEqual(options, {
      descending: false,
      endkey_docid: 'end-doc',
      endkey: ['range-end'],
      group: false,
      group_level: 2,
      include_docs: true,
      inclusive_end: false,
      key: 'primary',
      keys: ['k1', { foo: 'bar' }],
      limit: 10,
      reduce: false,
      skip: 5,
      sorted: false,
      stable: true,
      startkey: ['range-start'],
      startkey_docid: 'start-doc',
      update: 'lazy',
      update_seq: true
    })
  })

  test('alias methods map to canonical fields', () => {
    const options = new QueryBuilder()
      .endKey(['alias-end'])
      .startKey(['alias-start'])
      .end_key_doc_id('alias-end-doc')
      .start_key_doc_id('alias-start-doc')
      .end_key(['duplicate-end'])
      .start_key(['duplicate-start'])
      .build()

    assert.deepStrictEqual(options, {
      endkey: ['duplicate-end'],
      startkey: ['duplicate-start'],
      endkey_docid: 'alias-end-doc',
      startkey_docid: 'alias-start-doc'
    })
  })

  test('build returns a defensive copy', () => {
    const builder = new QueryBuilder().limit(5)
    const first = builder.build()
    first.limit = 42

    const second = builder.build()

    assert.notStrictEqual(first, second)
    assert.strictEqual(second.limit, 5)
  })

  test('createQuery returns a builder instance', () => {
    const builder = createQuery()
    assert.ok(builder instanceof QueryBuilder)
  })
})
