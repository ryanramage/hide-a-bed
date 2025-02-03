hide-a-bed
-----------

A simple way to abstract couchdb, and make your interface to the database testable. 

Install
-----

There are two packages, one for runtime that contains the real implementations and schema, and the other contains the stubs for tests.

```
npm i hide-a-bed --save
npm i hide-a-bed-stub --save-dev

```

Code that uses some example db apis
```
export function doStuff (config, services, id) {
  const doc = await services.db.get(config, id)
  const apiResult = services.callSomeApi(config, doc.userName)
  const query = {
    startkey: apiResult.startTime,
    endkey: apiResult.endTime
  }
  const queryResults = await db.query(config, '_design/userThings/_view/byTime', query)
  return queryResults.rows
}

```

Using doStuff, in a real env, connecting to a real couch
```
import db from 'hide-a-bed'
import { doStuff } from './doStuff'
import { callSomeApi } from './api'
// the config object needs a couch url
const config = { couch: 'http://localhost:5984/mydb' }
// build up a service api for all your external calls that can be mocked/stubbed
const services = { db, callSomeApi }
const afterStuff = await doStuff(config, services, 'happy-doc-id')

```

Mocking out the calls in a test, never connects to the network
```
import { setup } from 'hide-a-bed-stub' // different package, since installed with --save-dev reduces space
import { doStuff } from './doStuff'
import { callSomeApiMock } from './test/mock/api'
// the config object needs a couch url, prove to yourself that its mocked with a fakeurl
const config = { couch: 'http://fakeurl:5984/mydb' }

// we import or design docs that we will need for the db
import userThingsDesignDoc from './ddocs/userThingsDDoc.js'

test('doStuff works in stub mode', async t => {
    // we have to setup the db with the design docs that are required
    const db = await setup([userThingsDesignDoc])

    // build up a service api with all your fake endpoints
    const services = { db, callSomeApi: callSomeApiMock }
    const afterStuff = await doStuff(config, services, 'happy-doc-id')
})

```

API Reference
-------------

### Document Operations

#### get(config, id)
Get a single document by ID.
- `config`: Object with `couch` URL string
- `id`: Document ID string
- Returns: Promise resolving to document object or null if not found

#### put(config, doc) 
Save a document.
- `config`: Object with `couch` URL string
- `doc`: Document object with `_id` property
- Returns: Promise resolving to response with `ok`, `id`, `rev` properties

### Bulk Operations

#### bulkSave(config, docs)
Save multiple documents in one request.
- `config`: Object with `couch` URL string
- `docs`: Array of document objects, each with `_id`
- Returns: Promise resolving to array of results with `ok`, `id`, `rev` for each doc

#### bulkGet(config, ids)
Get multiple documents by ID.
- `config`: Object with `couch` URL string
- `ids`: Array of document ID strings
- Returns: Promise resolving to array of documents

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


