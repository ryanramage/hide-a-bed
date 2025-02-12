# hide-a-bed

> A clean, testable CouchDB abstraction layer for Node.js

`hide-a-bed` makes it easy to work with CouchDB in your Node.js applications while keeping your database code testable. It provides a simple interface for common CouchDB operations and includes a companion package for painless testing.

## Features

- 🚀 Simple, promise-based API for CouchDB operations
- 🧪 Built-in testing support with mock capabilities
- 🔄 Bulk operations support
- 📝 Type definitions included
- ⚡️ Modern ESM imports

## Installation

```bash
# Install the main package for production use
npm install hide-a-bed

# Install the testing utilities (recommended)
npm install hide-a-bed-stub --save-dev
```

## Quick Start

### Basic Usage

Here's a simple example of how to use hide-a-bed in your application:

```javascript
import { bindConfig } from 'hide-a-bed'

// Configure your database connection
const config = { couch: 'http://localhost:5984/mydb' }
const db = bindConfig(config)
const services = { db }

const doc = await db.get(userId)
```

### Writing Testable Code

The key to writing testable database code is to use dependency injection. Here's the recommended pattern:

```javascript
// userService.js
export async function getUserActivity(services, userId) {
  const user = await services.db.get(userId)
  const query = { 
        startkey: [userId, 0], 
        endkey: [userId, Date.now()], 
        include_docs: true 
    }
  const activity = await services.db.query('_design/userThings/_view/byTime', query)
  return { user, activity: activity.rows }
}

// Use in your application
const userData = await getUserActivity(services, 'user-123')
```

### Testing

Using the stub package makes testing your database code easy and reliable:

```javascript
import { setup } from 'hide-a-bed-stub'
import { getUserActivity } from './userService.js'

// NOTE - depending on your module system, these lines vary. This shows loading a cjs file
//        which is the most convoluted. 
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const viewDoc = require('./assets/viewDocs.cjs')

const config = { couch: 'http://fake:5984' } 
const { bindConfig } = await setup([viewDoc]) // this setups up the view to be available in your testing
const db = bindConfig(config)
const services = { db }


describe('getUserActivity', () => {
  it('retrieves user data and activity', async () => {
    // add some docs here that match/dont match the view 
    const docs = [
        { _id: 'test-user-id', name: 'bob'},
        { _id: 'act1', ts: 1, value: 'clicked', user: 'test-user-id' },
        { _id: 'act2', ts: 2, value: 'submit', user: 'test-user-id'},
        { _id: 'should-not', ts: 3, value: 'clicked', user: 'no-user' }
    ]
    await db.bulkSave(docs)

    // Run your test
    const result = await getUserActivity(services, 'test-user-id')
    assert(result.user)
    assert(Array.isArray(result.activity))
  })
})
```

## API Reference

The following CouchDB operations are supported:

- `get(config, id)` - Retrieve a document by ID
- `put(config, doc)` - Create or update a document
- `post(config, doc)` - Create a new document with auto-generated ID
- `delete(config, id, rev)` - Delete a document
- `bulkGet(config, ids)` - Retrieve multiple documents
- `bulkSave(config, docs)` - Save multiple documents
- `query(config, viewPath, options)` - Query a view

For detailed API documentation, please visit our [API Reference](https://github.com/ryanramage/hide-a-bed/blob/master/client/README.md)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT


