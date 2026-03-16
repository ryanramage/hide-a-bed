// import z from 'zod'
import z from 'zod'
import { bindConfig, get } from './index.mts'

const db = bindConfig({
  couch: 'http://localhost:5984/test-db',
  auth: {
    username: 'admin',
    password: 'znh5qym.TKR2raw7yef'
  },
  request: {
    timeout: 5000
  }
})

const testDoc = await db
  .options({
    request: {
      // timeout: 10
    }
  })
  .getDBInfo()

console.log('DB Info:', testDoc)

const allDocs = await db.query('_all_docs')
console.log('All docs:', allDocs)

// const newDoc = await db.put({
//   _id: 'test-doc',
//   name: 'Test Document'
// })
// console.log('Put new doc:', newDoc)

const fetchedDoc = await db.get('test-doc')
console.log('Fetched doc:', fetchedDoc)

const fetchedNotBound = await get(
  {
    couch: 'http://localhost:5984/test-db',
    auth: {
      username: 'admin',
      password: 'znh5qym.TKR2raw7yef'
    }
  },
  'test-doc',
  {
    validate: {
      docSchema: z.object({
        _id: z.string(),
        _rev: z.string(),
        name: z.string(),
        age: z.number()
      })
    }
  }
)
console.log('Fetched not bound doc:', fetchedNotBound)

if (fetchedDoc?._rev) {
  const patchedDoc = await db.patch('test-doc', {
    _rev: fetchedDoc._rev,
    name: 'Updated Test Document'
  })
  console.log('Patched doc:', patchedDoc)
}

const allDocsAfter = await db.query('_all_docs', {
  include_docs: true,
  validate: {
    docSchema: z.object({
      _id: z.string(),
      _rev: z.string(),
      name: z.string()
    })
  }
})

console.log('All docs after:', allDocsAfter)
