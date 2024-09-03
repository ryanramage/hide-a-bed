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

A function that uses some db apis. The config is described here: https://github.com/ryanramage/hide-a-bed/blob/master/client/schema/crud.mjs#L16-L18
but is basically an object that has a couch property which is the database url.

```
export function doStuff (config, services, id) {
  const doc = await services.db.get(config, id)
  const query = {
    startkey: 0,
    endkey: Date.now()
  }
  const queryResults = await services.db.query(config, '_design/userThings/_view/byTime', query)
  return queryResults.rows
}

```

Using doStuff, connecting to a real couch
```
import db from 'hide-a-bed'
import { doStuff } from './doStuff'
// the config object needs a couch url
const config = { couch: 'http://localhost:5984/mydb' }
// build up a service api for all your external calls that can be mocked/stubbed
const services = { db }
const afterStuff = await doStuff(config, services, 'happy-doc-id')

```

Mocking out the calls in a test, never connects to the network
```
import { setup } from 'hide-a-bed-stub' // different package, since installed with --save-dev reduces space
import { doStuff } from './doStuff'
// the config object needs a couch url, prove to yourself that its mocked with a fakeurl
const config = { couch: 'http://fakeurl:5984/mydb' }

// we import or design docs that we will need for the db
import userThingsDesignDoc from './ddocs/userThingsDDoc.js'

test('doStuff works in stub mode', async t => {
    // we have to setup the db with the design docs that are required
    const db = await setup([userThingsDesignDoc])

    // build up a service api with all your fake endpoints
    const services = { db }
    const afterStuff = await doStuff(config, services, 'happy-doc-id')
})

```

Below are all the couch apis available
-------------

__TODO__



