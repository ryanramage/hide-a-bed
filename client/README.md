API 
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

#### remove(config, id)
Delete a document by ID.
- `config`: Object with `couch` URL string
- `id`: Document ID string to delete
- Returns: Promise resolving to response with `ok` and `rev` properties

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

#### bulkRemove(config, ids)
Delete multiple documents in one request.
- `config`: Object with `couch` URL string
- `ids`: Array of document ID strings to delete
- Returns: Promise resolving to array of results with `ok`, `id`, `rev` for each deletion

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


