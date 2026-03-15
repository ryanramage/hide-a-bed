# Native Fetch Migration

Starting in v7, the main `hide-a-bed` client uses native `fetch` instead of `needle`.

## Breaking Change

The `needleOpts` config property has been removed from the main package. Upgrade by deleting any `needleOpts` usage from your config objects. If you were using `needleOpts.username` or `needleOpts.password`, move those values to `config.auth`. Couch URLs with embedded credentials are no longer supported.

Before:

```ts
const config = {
  couch: 'http://alice:secret@localhost:5984/mydb',
  needleOpts: {
    username: process.env.COUCHDB_USER,
    password: process.env.COUCHDB_PASSWORD
  }
}
```

After:

```ts
const config = {
  couch: 'http://localhost:5984/mydb',
  auth: {
    username: process.env.COUCHDB_USER,
    password: process.env.COUCHDB_PASSWORD
  }
}
```

## What stays the same

- CRUD, bulk, query, and streaming APIs keep the same public method signatures
- Retry and logging config still use the documented top-level config fields
- `watchDocs()` and `queryStream()` remain part of the main client package
