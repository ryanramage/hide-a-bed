# hide-a-bed

> A clean, testable CouchDB abstraction layer for Node.js

`hide-a-bed` simplifies working with CouchDB in your Node.js applications while keeping your database code testable. It provides a simple interface for common CouchDB operations and includes a companion package for painless testing.

## Features

- 🚀 Simple, promise-based API for CouchDB operations
- 🧪 Built-in testing support with mock capabilities
- 🔄 Bulk operations support
- 📝 Includes type definitions
- ⚡️ Modern ESM imports

## Installation

```bash
# Install the main package for production use
npm install hide-a-bed

# Install the testing utilities (recommended)
npm install hide-a-bed-stub --save-dev

# Install the standalone changes feed helper when needed
npm install hide-a-bed-changes
```

## Quick Start

### Basic Usage

Example usage of hide-a-bed:

```javascript
import { bindConfig } from 'hide-a-bed'

// Configure your database connection
const config = { couch: 'http://localhost:5984/mydb' }
const db = bindConfig(config)
const services = { db }

const doc = await db.get(userId)
```

### Writing Testable Code

The key to writing testable database code is to use dependency injection. The recommended pattern is: <!-- proofreader-ignore --> 

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

Using the stub package makes it easy and reliable to test your database code.

```javascript
import { setup } from 'hide-a-bed-stub'
import { getUserActivity } from './userService.js'

// NOTE: This demonstrates loading a CJS file, which is the most complex use case.
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const viewDoc = require('./assets/viewDocs.cjs')

const config = { couch: 'http://fake:5984' } 
const { bindConfig } = await setup([viewDoc]) // this sets up the view to be available in your test
const db = bindConfig(config)
const services = { db }

describe('getUserActivity', () => {
  it('retrieves user data and activity', async () => {
    // add some docs here that match/don't match the view <!-- proofreader-ignore --> 
    const docs = [
        { _id: 'test-user-id', name: 'Bob'},
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

For detailed documentation, visit our [API Reference](https://github.com/ryanramage/hide-a-bed/blob/master/client/README.md)

## Contributing

Contributions are welcome! Submit a pull request.

## License

Licensed under the MIT License.


