### API Quick Reference

🍭 denotes a *Sugar* API - helps make some tasks sweet and easy, but may hide some complexities you might want to deal with.

| Document Operations | Bulk Operations | View Operations | Change Utilities |
|-------------------|-----------------|-----------------|-----------------|
| [`get()`](#get) | [`bulkGet()`](#bulkget) | [`query()`](#query) | [`watchDocs()`](#watchdocs) 🍭 |
| [`put()`](#put) | [`bulkSave()`](#bulksave) | [`queryStream()`](#querystream) | [Standalone changes feed](#changes-feed-companion) |
| [`patch()`](#patch) 🍭 | [`bulkRemove()`](#bulkremove) | [`remove()`](#remove) | |
| [`patchDangerously()`](#patchdangerously) 🍭 | [`bulkRemoveMap()`](#bulkremovemap) | | |
| [`getAtRev()`](#getatrev) 🍭 | [`bulkGetDictionary()`](#bulkgetdictionary) 🍭 | | |
| [`createLock()`](#createlock) 🍭 | [`bulkSaveTransaction()`](#bulksavetransaction) 🍭 | | |
| [`removeLock()`](#removelock) 🍭 | | | |

And some utility APIs

- [`getDBInfo()`](#getdbinfo)
- [`createQuery()`](#createquery) 🍭
- [`withRetry()`](#withretry)

### Setup

Depending on your environment, use import or require

```
import { get, put, query } from 'hide-a-bed'
```

or

```
const { get, put, query } = require('hide-a-bed')
```

### Config

Anywhere you see a config, it is an object with the following setup
```{ couch: 'https://username:pass@the.couch.url.com:5984' }```
And it is passed in as the first argument of all the functions
```const doc = await get(config, 'doc-123')```

See [Advanced Config Options](#advanced-config-options) for more advanced settings.

#### bindConfig

bindConfig function is a convenience method to bind the config, so you don't need to pass it in every call.
Usually, you label the variable returned db so method calls appear to operate on the bound db.

```
import { bindConfig } from 'hide-a-bed'
const db = bindConfig(process.env)
const services = { db } // see example below
const doc = await db.get('doc-123')
```

If you need to enable autocompletion and type-checking, you can add the following JSDoc to help your editor

```
  function doSomething (services) {
    /**  @type { import('hide-a-bed').DB} db */
    const db = services.db;
  }
```

Here is an example of compiler warnings:

![jsdoc type def](docs/compiler.png)

##### Config Overrides

You also can quickly override (or more) config settings for a particular call using db.options(optionOverrides)

e.g.

```
const db = bindConfig({ couch: 'http://localhost:5984/db', throwOnGetNotFound: false  })
const doc = await db.options({ throwOnGetNotFound: true }).get('doc-id') 
```

You can pass any of [Config Options](#advanced-config-options) to db.options to override the original config bindings.

### Document Operations

#### get

Get a single document by ID.

**Parameters:**

- `config`: Object with
  - `couch` URL string
  - `throwOnGetNotFound` default false. If true, 404 docs throw
- `id`: Document ID string
- Returns: Promise resolving to document object or null if not found

```javascript
const config = { couch: 'http://localhost:5984/mydb' }
const doc = await get(config, 'doc-123')
console.log(doc._id, doc._rev)

const notFound = await get(config, 'notFound')
console.log(notFound) // null 

try {
  const config = { couch: 'http://localhost:5984/mydb', throwOnGetNotFound: true }
  await get(config, 'notFound')
} catch (err) {
  if (err.name === 'NotFoundError') console.log('Document not found')
}

```

#### put

Save a document.

**Parameters:**

- `config`: Object with `couch` URL string
- `doc`: Document object with `_id` property
- Returns: Promise resolving to response with `ok`, `id`, `rev` properties, eg: { ok: boolean, id: string, rev: string }

```javascript
const config = { couch: 'http://localhost:5984/mydb' }
const doc = { 
  _id: 'doc-123',
  type: 'user',
  name: 'Alice'
}
const result = await put(config, doc)
// result: { ok: true, id: 'doc-123', rev: '1-abc123' }

// imaginary rev returns a conflict
const doc = { _id: 'notThereDoc', _rev: '32-does-not-compute'}
const result2 = await db.put(doc)
console.log(result2) // { ok: false, error: 'conflict', statusCode: 409 }
```

#### patch

The patch function lets you update specific properties of a document. The _rev value must be set, and passed in with properties.

**Parameters:**

- `config`: Object with couch URL string
- `id`: Document ID string
- `properties`: Object with properties to update, must include _rev property
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

#### patchDangerously

Update specific properties of a document, no _rev is needed.

**Parameters:**

- `config`: Object with couch URL string
- `id`: Document ID string
- `properties`: Object with properties to update

*Warning*: patchDangerously can clobber data. It will retry even if a conflict happens. There are some use cases for this, but you have been warned, hence the name.

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

#### getAtRev

Return a document at the rev specified.

**Parameters:**

- `config`: Object with couch URL string
- `id`: Document ID string
- `rev`: Revision string to retrieve

*CouchDB* is not a version control db. This is a special function for unique situations. The _rev might not be around as couch cleans up old revs.

```javascript
const config = { couch: 'http://localhost:5984/mydb' }
const doc = await getAtRev(config, 'doc-123', '2-fsdjfsdakljfsajlksd')
console.log(doc._id, doc._rev)
```

#### createLock

Create a lock document to try and prevent concurrent modifications.

Note this does not internally lock the document that is referenced by the id. People can still mutate it with
all the other document mutation functions. This should just be used at an app level to coordinate access
on long running document editing.

**Parameters:**

- `config`: Object with `couch` URL string
- `docId`: Document ID string to lock
- `options`: Lock options object:
  - `enableLocking`: Boolean to enable/disable locking (default: true)
  - `username`: String identifying who created the lock

Returns a Promise resolving to boolean indicating if lock was created successfully.

#### removeLock

Remove a lock from a document.

**Parameters:**

- `config`: Object with `couch` URL string
- `docId`: Document ID string to unlock
- `options`: Lock options object:
  - `enableLocking`: Boolean to enable/disable locking (default: true)
  - `username`: String identifying who is removing the lock

Only the user who created the lock can remove it.

```javascript
const config = { couch: 'http://localhost:5984/mydb' }
const options = {
  enableLocking: true,
  username: 'alice'
}

const locked = await createLock(config, 'doc-123', options)
if (locked) {
  // Document is now locked for exclusive access
  // Perform your updates here
  await removeLock(config, 'doc-123', options)
}
// Lock is now removed if it existed and was owned by 'alice'
```

### Bulk Operations

#### bulkSave

Save multiple documents in one request.

**Parameters:**

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
// [
//   { ok: true, id: 'doc1', rev: '1-abc123' },
//   { ok: true, id: 'doc2', rev: '1-def456' }
// ]
```

#### bulkGet

Get multiple documents by ID.

**Parameters:**

- `config`: Object with `couch` URL string
- `ids`: Array of document ID strings
- Returns: Promise resolving to array of documents

Warning: documents that are not found will still have a row in the results. The doc property will be null, and the error property will be set.

```javascript
const config = { couch: 'http://localhost:5984/mydb' }
const ids = ['doc1', 'doc2', 'doesNotExist']
const docs = await bulkGet(config, ids)
// rows: [
//   { _id: 'doc1', _rev: '1-abc123', type: 'user', name: 'Alice' },
//   { _id: 'doc2', _rev: '1-def456', type: 'user', name: 'Bob' },
//   { key: 'doesNotExist', error: 'not_found' }
// ]
```

#### bulkRemove

Delete multiple documents in one request.

**Parameters:**

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

#### remove

Delete document from DB with id and rev.

Allows more efficient deletion of document by providing only id and rev. This is useful for deleting documents that are large, or have a lot of data.

**Parameters:**

- `config`: Object with `couch` URL string
- `id`: document ID to delete
- `rev`: rev of the document to delete
- Returns: Promise resolving to array of results with `ok`, `id`, `rev` for the deletion

```javascript
const config = { couch: 'http://localhost:5984/mydb' }
const id = 'doc1'
const rev = '2-ghi789'
const results = await remove(config, id, rev)
// result:
//   { ok: true, id: 'doc1', rev: '2-ghi789' }
```

#### bulkRemoveMap

Delete multiple documents in one request. Same inputs and outputs as [bulkRemove](#bulkremove), but internally the logic will handle one document at a time instead of using couch bulk operations. Useful for working with documents that have large data requirements (1MB or more).

**Parameters:**

- `config`: Object with `couch` URL string
- `ids`: Array of document ID strings to delete
- Returns: Promise resolving to array of results with `ok`, `id`, `rev` for each deletion

```javascript
const config = { couch: 'http://localhost:5984/mydb' }
const ids = ['doc1', 'doc2']
const results = await bulkRemoveMap(config, ids)
// results: [
//   { ok: true, id: 'doc1', rev: '2-ghi789' },
//   { ok: true, id: 'doc2', rev: '2-jkl012' }
// ]
```

#### bulkGetDictionary

Adds convenience to bulkGet. Organizes found and notFound documents into properties that are {id:result}. This makes it easy to deal with the results.

**Parameters:**

- `config`: Object with `couch` URL string
- `ids`: Array of document ID strings to get
- Returns: Promise resolving to an object with found and notFound properties.

*found* looks like

```
{ 
  doc1: { _id: 'doc1', _rev: '1-221', data: {} },
  doc2: { _id: 'doc2', _rev: '4-421', data: {} },
}
```

*notFound* looks like

```
{
  doesNotExist: { key: 'doesNotExist', error: 'not_found' }
}
```

```javascript
const config = { couch: 'http://localhost:5984/mydb' }
const ids = ['doc1', 'doc2', 'doesNotExist']
const results = await bulkGetDictionary(config, ids)
// results: {
//   found: {
//     doc1: { _id: 'doc2', _rev: '1-221', data: {} },
//     doc2: { _id: 'doc2', _rev: '4-421', data: {} },
//   },
//   notFound: {
//      doesNotExist: { key: 'doesNotExist', error: 'not_found' }
//   }
// }
```

#### bulkSaveTransaction

Perform a bulk save operation with all-or-nothing semantics.

**Parameters:**

- `config`: Object with `couch` URL string
- `transactionId`: Unique identifier for the transaction
- `docs`: Array of document objects to save
- Returns: Promise resolving to array of results with `ok`, `id`, `rev` for each doc

This operation ensures that either all documents are saved successfully, or none are, maintaining data consistency. If any document fails to save, the operation will attempt to roll back all changes.

Note: The transactionId has to be unique for the lifetime of the app. It is used to prevent two processes from executing the same transaction. It is up to you to craft a transactionId that uniquely represents this transaction, and that also is the same if another process tries to generate it.

Exceptions to handle:

- `TransactionSetupError`: Thrown if the transaction document cannot be created. Usually because it already exists
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
    // the transaction could not start - usually an existing transaction with the same id
    console.error('Transaction setup failed:', error)
  } else if (error instanceof TransactionVersionConflictError) {
    // one or more of the versions of the docs provided dont match with what is currently in the db
    console.error('Version conflict error:', error)
  } else if (error instanceof TransactionRollbackError) {
    // the transaction was rolled back - so the 'or none' condition occured
    console.error('Rollback error:', error)
  } else {
    console.error('Unexpected error:', error)
  }
}
```

#### getDBInfo()

Get basic info about a db in couch

```
const config = { couch: 'http://localhost:5984/mydb' }
const result = await getDBInfo(config)
// result: { db_name: 'test', doc_count: 3232 } 
```

### View Queries

#### query

Query a view with options.

**Parameters:**

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

Some notes on the keys. Use native js types for arrays keys, rather then strings. Eg

- ```{ startkey: ['ryan'], endkey: ['ryan', {}] }```
- ```{ startkey: [47, null], endkey: [48, null] }```
- ```{ startkey: [customerIdVar], endkey: [customerIdVar, {}] }```
- ```{ startkey: [teamId, userId, startTimestamp], endkey: [teamId, userId, endTimestamp] }```

#### createQuery()

Create a query builder to help construct view queries with a fluent interface. Note we have stuck to couch naming conventions and not camel case.

- Returns: QueryBuilder instance with methods:
  - `key(value)`: Set exact key match
  - `startkey(value)`: Set range start key
  - `endkey(value)`: Set range end key
  - `descending(bool)`: Set descending sort order
  - `skip(number)`: Set number of results to skip
  - `limit(number)`: Set max number of results
  - `include_docs(bool)`: Include full documents
  - `reduce(bool)`: Enable/disable reduce
  - `group(bool)`: Enable/disable grouping
  - `group_level(number)`: Set group level
  - `build()`: Return the constructed query options object

```javascript
const options = createQuery()
  .startkey('A')
  .endkey('B')
  .include_docs(true)
  .limit(10)
  .build()

const result = await query(config, view, options)
```

Again, use js types for array keys

- ```.startkey([teamId, userId]).endkey([teamId, userId, {}])```
- ```.startkey([teamId, userId, startTimestamp]).endkey([teamId, userId, endTimestamp])```

#### queryStream

Use Cases *Streaming Data*

**Parameters:**

- `config`: Object with couch URL string
- `view`: View path string
- `options`: Query options object
- `onRow`: Function called for each row in the results

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
    handler: async (req, h) => {
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

Want to consume this in the browser? I'd recommend [ndjson-readablestream](https://www.npmjs.com/package/ndjson-readablestream)
An [example react component](https://github.com/Azure-Samples/azure-search-openai-demo/pull/532/files#diff-506debba46b93087dc46a916384e56392808bcc02a99d9291557f3e674d4ad6c)
that consumes the readable stream.

#### Changes feed companion

The main client no longer bundles the legacy `changes-stream` dependency. Install [`hide-a-bed-changes`](../changes) when you need a CouchDB `_changes` feed helper:

```
npm install hide-a-bed-changes
```

Usage mirrors the original API:

```javascript
import { changes } from 'hide-a-bed-changes'

const config = { couch: 'http://localhost:5984/mydb' }

const feed = await changes(config, change => {
  console.log('Document changed:', change.id)
}, { since: 'now', include_docs: true })

feed.on('error', console.error)

// later
feed.stop()
```

`hide-a-bed-changes` reuses the same config structure, merges `config.needleOpts`, and resolves `since: 'now'` to the current `update_seq` before starting the feed.

#### watchDocs ()

Watch specific documents for changes in real-time.

 **Parameters:**

- `config`: Object with `couch` URL string
- `docIds`: String or array of document IDs to watch (max 100)
- `onChange`: Function called for each change
- `options`: Optional object with parameters:
  - `include_docs`: Boolean - include full documents (default false)
  - `maxRetries`: Number - maximum reconnection attempts (default: 10)
  - `initialDelay`: Number - initial reconnection delay in ms (default 1000)
  - `maxDelay`: Number - maximum reconnection delay in ms (default: 30000)

 Returns an EventEmitter that emits:

- 'change' events with change objects.
- 'error' events when max retries reached.
- 'end' events with last sequence number.

 ```javascript
 const config = { couch: 'http://localhost:5984/mydb' }

 // Watch a single document
 const feed = await watchDocs(config, 'doc123', change => {
   console.log('Document changed:', change.id)
   console.log('New revision:', change.changes[0].rev)
 })

 // Watch multiple documents with full doc content
 const feed = await watchDocs(
   config,
   ['doc1', 'doc2', 'doc3'],
   change => {
     if (change.doc) {
       console.log('Updated document:', change.doc)
     }
   },
   { include_docs: true }
 )

 // Handle errors
 feed.on('error', error => {
   console.error('Watch error:', error)
 })

 // Handle end of feed
 feed.on('end', ({ lastSeq }) => {
   console.log('Feed ended at sequence:', lastSeq)
 })

 // Stop watching
 feed.stop()
 ```

 The watchDocs feed is useful for:

 1. Building real-time applications focused on specific documents
 2. Triggering actions when particular documents change
 3. Maintaining cached copies of frequently-accessed documents

### Advanced Config Options

The config object supports the following properties:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| couch | string | required | The URL of the CouchDB database |
| throwOnGetNotFound | boolean | false | If true, throws an error when get() returns 404. If false, returns null |
| bindWithRetry | boolean | true | When using bindConfig(), adds retry logic to bound methods |
| maxRetries | number | 3 | Maximum number of retry attempts for retryable operations |
| initialDelay | number | 1000 | Initial delay in milliseconds before first retry |
| backoffFactor | number | 2 | Multiplier for exponential backoff between retries |
| useConsoleLogger | boolean | false | If true, enables console logging when no logger is provided |
| logger | object/function | undefined | Custom logging interface (winston-style object or function) |

Example configuration with all options:

```javascript
const config = {
  couch: 'http://localhost:5984/mydb',
  throwOnGetNotFound: true,
  bindWithRetry: true,
  maxRetries: 5,
  initialDelay: 2000,
  backoffFactor: 1.5,
  useConsoleLogger: true,
  logger: (level, ...args) => console.log(level, ...args)
}
```

### Logging Support

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

- error: Fatal/unrecoverable errors.
- warn: Retryable errors, conflicts.
- info: Operation start/completion.
- debug: Detailed operation information.
