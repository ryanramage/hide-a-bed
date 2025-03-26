// @ts-check

/**
 * @typedef {Object} QueryOptions
 * @property {any} [key] - Exact key to match
 * @property {any} [startkey] - Start of key range
 * @property {any} [endkey] - End of key range
 * @property {boolean} [reduce] - Whether to use reduce function
 * @property {boolean} [group] - Whether to group results
 * @property {number} [group_level] - Level at which to group
 * @property {boolean} [include_docs] - Whether to include full couch docs
 * @property {string} [stale] - Stale parameter value
 * @property {number} [limit] - Max number of results
 * @property {boolean} [descending] - Whether to return results in descending order
 * @property {number} [skip] - Number of results to skip
 * @property {any[]} [keys] - Array of keys to match
 */

export class QueryBuilder {
  /** @type {QueryOptions} */
  #options = {}

  /**
   * @param {any} key
   * @returns {QueryBuilder}
   */
  key (key) {
    this.#options.key = key
    return this
  }

  /**
   * @param {any} startkey
   * @returns {QueryBuilder}
   */
  startKey (startkey) {
    this.#options.startkey = startkey
    return this
  }

  /**
   * @param {any} startkey
   * @returns {QueryBuilder}
   */
  startkey (startkey) {
    this.#options.startkey = startkey
    return this
  }

  /**
   * @param {any} endkey
   * @returns {QueryBuilder}
   */
  endKey (endkey) {
    this.#options.endkey = endkey
    return this
  }

  /**
   * @param {any} endkey
   * @returns {QueryBuilder}
   */
  endkey (endkey) {
    this.#options.endkey = endkey
    return this
  }

  /**
   * @param {boolean} reduce
   * @returns {QueryBuilder}
   */
  reduce (reduce = true) {
    this.#options.reduce = reduce
    return this
  }

  /**
   * @param {boolean} group
   * @returns {QueryBuilder}
   */
  group (group = true) {
    this.#options.group = group
    return this
  }

  /**
   * @param {number} level
   * @returns {QueryBuilder}
   */
  groupLevel (level) {
    this.#options.group_level = level
    return this
  }

  /**
   * @param {number} level
   * @returns {QueryBuilder}
   */
  group_level (level) {
    this.#options.group_level = level
    return this
  }

  /**
   * @param {boolean} includeDocs
   * @returns {QueryBuilder}
   */
  includeDocs (includeDocs = true) {
    this.#options.include_docs = includeDocs
    return this
  }

  /**
   * @param {boolean} includeDocs
   * @returns {QueryBuilder}
   */
  include_docs (includeDocs = true) {
    this.#options.include_docs = includeDocs
    return this
  }

  /**
   * @param {string} stale
   * @returns {QueryBuilder}
   */
  stale (stale) {
    this.#options.stale = stale
    return this
  }

  /**
   * @param {number} limit
   * @returns {QueryBuilder}
   */
  limit (limit) {
    this.#options.limit = limit
    return this
  }

  /**
   * @param {boolean} descending
   * @returns {QueryBuilder}
   */
  descending (descending = true) {
    this.#options.descending = descending
    return this
  }

  /**
   * @param {number} skip
   * @returns {QueryBuilder}
   */
  skip (skip) {
    this.#options.skip = skip
    return this
  }

  /**
   * @param {any[]} keys
   * @returns {QueryBuilder}
   */
  keys (keys) {
    this.#options.keys = keys
    return this
  }

  /**
   * @returns {QueryOptions}
   */
  build () {
    return { ...this.#options }
  }
}

export const createQuery = () => new QueryBuilder()
