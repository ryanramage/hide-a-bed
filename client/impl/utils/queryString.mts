import { ViewOptions } from '../../schema/couch/couch.input.schema.ts'

const KEYS_TO_QUOTE: (keyof ViewOptions)[] = [
  'endkey_docid',
  'endkey',
  'key',
  'keys',
  'startkey',
  'startkey_docid',
  'update'
]

/**
 * Serialize CouchDB view options into a URL-safe query string, quoting values CouchDB expects as JSON.
 * @param options The view options to serialize
 * @param params The list of option keys that require JSON quoting
 * @returns The serialized query string
 */
export function queryString(options: ViewOptions = {}): string {
  const searchParams = new URLSearchParams()
  const parsedOptions = ViewOptions.parse(options)
  Object.entries(parsedOptions).forEach(([key, rawValue]) => {
    let value = rawValue
    if (KEYS_TO_QUOTE.includes(key as keyof ViewOptions)) {
      if (typeof value === 'string') value = `"${value}"`
      if (Array.isArray(value)) {
        value =
          '[' +
          value
            .map(i => {
              if (i === null) return 'null'
              if (typeof i === 'string') return `"${i}"`
              if (typeof i === 'object' && Object.keys(i).length === 0) return '{}'
              if (typeof i === 'object') return JSON.stringify(i)
              return i
            })
            .join(',') +
          ']'
      }
    }
    searchParams.set(key, String(value))
  })
  return searchParams.toString()
}
