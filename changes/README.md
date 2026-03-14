# hide-a-bed-changes

A small companion package for [hide-a-bed](../client) that exposes the CouchDB `_changes` feed without bundling the legacy `changes-stream` dependency into the main client.

```js
import { changes } from 'hide-a-bed-changes'
import { bindConfig } from 'hide-a-bed'

const db = bindConfig({ couch: 'http://localhost:5984/mydb' })

const feed = await changes(
  { couch: 'http://localhost:5984/mydb' },
  change => {
    console.log('doc changed', change)
  },
  { since: 'now', include_docs: true }
)

feed.on('error', console.error)

// Later
feed.stop()
```

## API

### `await changes(config, onChange, options?)`

- `config.couch` – required CouchDB base URL.
- `config.needleOpts` – optional default request options merged into supporting HTTP calls.
- `onChange(change)` – handler invoked for each change entry.
- `options` – forwarded to `changes-stream`. When `since` is set to `"now"`, the helper fetches the current `update_seq` before starting the feed.

The returned object exposes `on(event, listener)`, `removeListener(event, listener)` and `stop()` to mirror the original hide-a-bed API.
