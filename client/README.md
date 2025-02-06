API 
-------------

### Setup

Depending on your environment, use import or require

```
import { get, put, patch, remove, bulkSave, bulkGet, bulkRemove, query } from 'hide-a-bed'
```
```
const { get, put, patch, remove, bulkSave, bulkGet, bulkRemove, query } = require('hide-a-bed')
```

### Config

Anywhere you see a config, it is an object with the following setup

```
{ couch: 'https://username:pass@the.couch.url.com:5984' }
```
Couch get is weird. We have chosen to return ```undefined``` if the doc is not found. All other things throw. If you want 
not_found to also throw an exception, add the following to your config:

```
{ throwOnGetNotFound: true, couch: '...' }
```

### Document Operations


#### get(config, id)
Get a single document by ID.
- `config`: Object with `couch` URL string
- `id`: Document ID string
- Returns: Promise resolving to document object or null if not found

```javascript
const config = { couch: 'http://localhost:5984/mydb' }
const doc = await get(config, 'doc-123')
if (doc) {
  console.log(doc._id, doc._rev)
}
```

#### put(config, doc) 
Save a document.
- `config`: Object with `couch` URL string
- `doc`: Document object with `_id` property
- Returns: Promise resolving to response with `ok`, `id`, `rev` properties

```javascript
const config = { couch: 'http://localhost:5984/mydb' }
const doc = { 
  _id: 'doc-123',
  type: 'user',
  name: 'Alice'
}
const result = await put(config, doc)
// result: { ok: true, id: 'doc-123', rev: '1-abc123' }
```

#### patch(config, id, properties)
Update specific properties of a document with retry mechanism.
- `config`: Object with:
  - `couch`: URL string
  - `retries`: Optional number of retry attempts (default: 5)
  - `delay`: Optional milliseconds between retries (default: 1000)
- `id`: Document ID string
- `properties`: Object with properties to update
- Returns: Promise resolving to response with `ok`, `id`, `rev` properties

```javascript
const config = { 
  couch: 'http://localhost:5984/mydb',
  retries: 3,
  delay: 500
}
const properties = { 
  name: 'Alice Smith',
  updated: true
}
const result = await patch(config, 'doc-123', properties)
// result: { ok: true, id: 'doc-123', rev: '2-xyz789' }
```

#### remove(config, id)
Delete a document by ID.
- `config`: Object with `couch` URL string
- `id`: Document ID string to delete
- Returns: Promise resolving to response with `ok` and `rev` properties

```javascript
const config = { couch: 'http://localhost:5984/mydb' }
const result = await remove(config, 'doc-123')
// result: { ok: true, id: 'doc-123', rev: '2-def456' }
```

### Bulk Operations

#### bulkSave(config, docs)
Save multiple documents in one request.
- `config`: Object with `couch` URL string
- `docs`: Array of document objects, each with `_id`
- Returns: Promise resolving to array of results with `ok`, `id`, `rev` for each doc

```javascript
const config = { couch: 'http://localhost:5984/mydb' }
const docs = [
  { _id: 'doc1', type: 'user', name: 'Alice' },
  { _id: 'doc2', type: 'user', name: 'Bob' }
]
const results = await bulkSave(config, docs)
// results: [
//   { ok: true, id: 'doc1', rev: '1-abc123' },
//   { ok: true, id: 'doc2', rev: '1-def456' }
// ]
```

#### bulkGet(config, ids)
Get multiple documents by ID.
- `config`: Object with `couch` URL string
- `ids`: Array of document ID strings
- Returns: Promise resolving to array of documents

```javascript
const config = { couch: 'http://localhost:5984/mydb' }
const ids = ['doc1', 'doc2']
const docs = await bulkGet(config, ids)
// docs: [
//   { _id: 'doc1', _rev: '1-abc123', type: 'user', name: 'Alice' },
//   { _id: 'doc2', _rev: '1-def456', type: 'user', name: 'Bob' }
// ]
```

#### bulkRemove(config, ids)
Delete multiple documents in one request.
- `config`: Object with `couch` URL string
- `ids`: Array of document ID strings to delete
- Returns: Promise resolving to array of results with `ok`, `id`, `rev` for each deletion

```javascript
const config = { couch: 'http://localhost:5984/mydb' }
const ids = ['doc1', 'doc2']
const results = await bulkRemove(config, ids)
// results: [
//   { ok: true, id: 'doc1', rev: '2-ghi789' },
//   { ok: true, id: 'doc2', rev: '2-jkl012' }
// ]
```

### View Queries

#### query(config, view, options)
Query a view with options.
- `config`: Object with `couch` URL string
- `view`: View path string (e.g. '_design/doc/_view/name')
- `options`: Optional object with query parameters:
  - `startkey`: Start key for range
  - `endkey`: End key for range
  - `key`: Exact key match
  - `descending`: Boolean to reverse sort
  - `skip`: Number of results to skip
  - `limit`: Max number of results
  - `include_docs`: Boolean to include full docs
  - `reduce`: Boolean to reduce results
  - `group`: Boolean to group results
  - `group_level`: Number for group level
- Returns: Promise resolving to response with `rows` array

```javascript
const config = { couch: 'http://localhost:5984/mydb' }
const view = '_design/users/_view/by_name'
const options = {
  startkey: 'A',
  endkey: 'B',
  include_docs: true,
  limit: 10
}
const result = await query(config, view, options)
// result: {
//   rows: [
//     { 
//       id: 'doc1',
//       key: 'Alice',
//       value: 1,
//       doc: { _id: 'doc1', name: 'Alice', type: 'user' }
//     },
//     // ... more rows
//   ]
// }
```

Bind Config
============

Dont want to pass around a config object everywhere? Bind the config for smaller api in your app

```
import { bindConfig } from 'hide-a-bed'
import { env } from 'custom-env'
env()
const {get, put, patch, remove, bulkSave, bulkGet, bulkRemove, query} = bindConfig(process.env)
const doc = await get('id-123')
```

