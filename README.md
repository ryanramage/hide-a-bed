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
import db from 'hide-a-bed'

// Configure your database connection
const config = { 
  couch: 'http://localhost:5984/mydb'
}

// Example function using the database
async function getUserData(userId) {
  const doc = await db.get(config, userId)
  return doc
}
```

### Writing Testable Code

The key to writing testable database code is to use dependency injection. Here's the recommended pattern:

```javascript
// userService.js
export async function getUserActivity(config, services, userId) {
  const user = await services.db.get(config, userId)
  const activity = await services.db.query(
    config,
    '_design/userThings/_view/byTime',
    {
      startkey: 0,
      endkey: Date.now()
    }
  )
  return { user, activity: activity.rows }
}
```

### Production Usage

```javascript
import db from 'hide-a-bed'
import { getUserActivity } from './userService.js'

const config = { 
  couch: 'http://localhost:5984/mydb' 
}
const services = { db }

// Use in your application
const userData = await getUserActivity(config, services, 'user-123')
```

### Testing

Using the stub package makes testing your database code easy and reliable:

```javascript
import { setup } from 'hide-a-bed-stub'
import { getUserActivity } from './userService.js'
import userDesignDoc from './ddocs/userThings.js'

describe('getUserActivity', () => {
  it('retrieves user data and activity', async () => {
    // Setup mock database with design docs
    const db = await setup([userDesignDoc])
    
    // Test configuration
    const config = { 
      couch: 'http://test:5984/testdb' 
    }
    const services = { db }

    // Run your test
    const result = await getUserActivity(config, services, 'test-user-id')
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

For detailed API documentation, please visit our [API Reference](https://github.com/ryanramage/hide-a-bed/wiki/API-Reference).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT


