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
Update specific properties of a document, you must know the _rev, and passed in with properties 
- `id`: Document ID string
- `properties`: Object with properties to update, one _must_ be the current _rev
- Returns: Promise resolving to response with `ok`, `id`, `rev` properties

```javascript
const config = { 
  couch: 'http://localhost:5984/mydb',
  retries: 3,
  delay: 500
}
const properties = { 
  _rev: '3-fdskjhfsdkjhfsd',
  name: 'Alice Smith',
  updated: true
}
const result = await patch(config, 'doc-123', properties)
// result: { ok: true, id: 'doc-123', rev: '2-xyz789' }
```
#### patchDangerously(config, id, properties)
Update specific properties of a document, no _rev is needed

*warning* - this can clobber data. It will retry even if a conflict happens. There are some use cases for this, but you have been warned, hence the name.

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
const result = await patchDangerously(config, 'doc-123', properties)
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

#### bulkSaveTransaction(config, transactionId, docs)
Perform a bulk save operation with all-or-nothing semantics.
- `config`: Object with `couch` URL string
- `transactionId`: Unique identifier for the transaction
- `docs`: Array of document objects to save
- Returns: Promise resolving to array of results with `ok`, `id`, `rev` for each doc

This operation ensures that either all documents are saved successfully, or none are, maintaining data consistency. If any document fails to save, the operation will attempt to roll back all changes.

Exceptions to handle:
- `TransactionSetupError`: Thrown if the transaction document cannot be created.
- `TransactionVersionConflictError`: Thrown if there are version conflicts with existing documents.
- `TransactionBulkOperationError`: Thrown if the bulk save operation fails for some documents.
- `TransactionRollbackError`: Thrown if the rollback operation fails after a transaction failure.

```javascript
const config = { couch: 'http://localhost:5984/mydb' }
const transactionId = 'txn-123'
const docs = [
  { _id: 'doc1', type: 'user', name: 'Alice', _rev: '1-abc123' },
  { _id: 'doc2', type: 'user', name: 'Bob', _rev: '1-def456' }
]

try {
  const results = await bulkSaveTransaction(config, transactionId, docs)
  console.log('Transaction successful:', results)
} catch (error) {
  if (error instanceof TransactionSetupError) {
    console.error('Transaction setup failed:', error)
  } else if (error instanceof TransactionVersionConflictError) {
    console.error('Version conflict error:', error)
  } else if (error instanceof TransactionBulkOperationError) {
    console.error('Bulk operation error:', error)
  } else if (error instanceof TransactionRollbackError) {
    console.error('Rollback error:', error)
  } else {
    console.error('Unexpected error:', error)
  }
}
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

Logging Support
==============

The library supports flexible logging options that can be configured through the config object:

```javascript
// Enable console logging (error, warn, info, debug)
const config = { 
  couch: 'http://localhost:5984/mydb',
  useConsoleLogger: true
}

// Use a custom logger object (winston-style)
const config = {
  couch: 'http://localhost:5984/mydb',
  logger: {
    error: (msg) => console.error(msg),
    warn: (msg) => console.warn(msg),
    info: (msg) => console.info(msg),
    debug: (msg) => console.debug(msg)
  }
}

// Use a simple function logger
const config = {
  couch: 'http://localhost:5984/mydb',
  logger: (level, ...args) => console.log(level, ...args)
}
```

The logger will track operations including:
- Document operations (get, put, patch)
- Bulk operations
- View queries
- Streaming operations
- Retries and error handling

Each operation logs appropriate information at these levels:
- error: Fatal/unrecoverable errors
- warn: Retryable errors, conflicts
- info: Operation start/completion
- debug: Detailed operation information


Streaming Support
=================

Want to stream data from couch? You can with queryStream. It looks identical to query, except you add an extra 'onRow' function

Here is a small hapi example of streaming data from couch to the client as ndjson. 
We do a small transform by only streaming the doc. you can do a lot of things in the onrow function.

```
import Hapi from '@hapi/hapi';
import { Readable } from 'stream';
import { queryStream } from bindConfig(process.env)
const view = '_design/users/_view/by_name'

const init = async () => {
  const server = Hapi.server({ port: 3000 })
  server.route({
    method: 'GET',
    path: '/stream',
    handler: async (request, h) => {
      const stream = new Readable({ read() {} });
      const onRow = ({id, key, value, doc}) => stream.push(JSON.stringify(doc) + '\n')
      const options = { startkey: req.query.startLetter, endkey: req.query.startLetter + '|', include_docs: true}
      await queryStream(view, options, onRow)
      stream.push(null) // end stream
      return h.response(stream).type('application/x-ndjson');
    }
  })

  await server.start();
  console.log(`Server running on ${server.info.uri}`);
}
init()
```

