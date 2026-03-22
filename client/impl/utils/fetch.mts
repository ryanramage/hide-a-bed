import { RetryableError } from './errors.mts'
import type { RequestOptions } from '../../schema/request.mts'
import { composeAbortSignal } from './request.mts'

export type HttpMethod = 'DELETE' | 'GET' | 'POST' | 'PUT'

type NativeFetchBody = RequestInit['body']

export type FetchBody =
  | NativeFetchBody
  | Record<string, unknown>
  | Array<unknown>
  | null
  | undefined

export type FetchAuth = {
  password: string
  username: string
}

export type FetchResult<TBody> = {
  body: TBody
  headers: Headers
  statusCode: number
}

export type FetchRequestOptions = {
  auth?: FetchAuth
  body?: FetchBody
  headers?: Record<string, string>
  method: HttpMethod
  operation?:
    | 'get'
    | 'getAtRev'
    | 'getDBInfo'
    | 'patch'
    | 'patchDangerously'
    | 'put'
    | 'query'
    | 'queryStream'
    | 'remove'
    | 'request'
    | 'watchDocs'
  request?: RequestOptions
  signal?: AbortSignal
  url: string | URL
}

const JSON_HEADERS = {
  'Content-Type': 'application/json'
} as const

const hasHeader = (headers: Record<string, string>, name: string) => {
  const expected = name.toLowerCase()
  return Object.keys(headers).some(header => header.toLowerCase() === expected)
}

const toBasicAuthHeader = ({ username, password }: FetchAuth) => {
  const token = Buffer.from(`${username}:${password}`).toString('base64')
  return `Basic ${token}`
}

const prepareRequest = (options: FetchRequestOptions) => {
  const auth = options.auth
  const headers = { ...(options.headers ?? {}) }

  if (auth && !hasHeader(headers, 'Authorization')) {
    headers.Authorization = toBasicAuthHeader(auth)
  }

  return { headers }
}

const isAbortError = (err: unknown): err is DOMException => {
  return err instanceof DOMException && err.name === 'AbortError'
}

const isTimeoutError = (err: unknown): err is DOMException => {
  return err instanceof DOMException && err.name === 'TimeoutError'
}

const encodeBody = (body: FetchBody): NativeFetchBody | undefined => {
  if (body == null) return undefined

  if (
    typeof body === 'string' ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ReadableStream
  ) {
    return body as NativeFetchBody
  }

  return JSON.stringify(body)
}

const parseJsonResponse = async (response: Response): Promise<unknown> => {
  if (response.status === 204 || response.status === 205) {
    return null
  }

  const text = await response.text()

  if (text.trim() === '') {
    return null
  }

  try {
    return JSON.parse(text)
  } catch (err) {
    if (response.ok) {
      throw err
    }

    return text
  }
}

export async function fetchCouchJson<TBody = unknown>(
  options: FetchRequestOptions
): Promise<FetchResult<TBody>> {
  let response: Response
  const { headers } = prepareRequest(options)
  const { signal, timedOut } = composeAbortSignal(options.signal, options.request)

  try {
    response = await fetch(options.url, {
      method: options.method,
      headers: {
        ...JSON_HEADERS,
        ...headers
      },
      body: encodeBody(options.body),
      signal,
      dispatcher: options.request?.dispatcher
    })
  } catch (err) {
    if (timedOut() || isTimeoutError(err)) {
      throw new RetryableError('Request timed out', 503, {
        category: 'network',
        cause: err,
        operation: options.operation
      })
    }

    if (isAbortError(err)) {
      throw err
    }

    RetryableError.handleNetworkError(err, options.operation)
  }

  const body = (await parseJsonResponse(response)) as TBody

  return {
    body,
    headers: response.headers,
    statusCode: response.status
  }
}

export async function fetchCouchStream(
  options: FetchRequestOptions
): Promise<FetchResult<ReadableStream<Uint8Array> | null>> {
  let response: Response
  const { headers } = prepareRequest(options)
  const { signal, timedOut } = composeAbortSignal(options.signal, options.request)

  try {
    response = await fetch(options.url, {
      method: options.method,
      headers,
      body: encodeBody(options.body),
      signal,
      dispatcher: options.request?.dispatcher
    })
  } catch (err) {
    if (timedOut() || isTimeoutError(err)) {
      throw new RetryableError('Request timed out', 503, {
        category: 'network',
        cause: err,
        operation: options.operation
      })
    }

    if (isAbortError(err)) {
      throw err
    }

    RetryableError.handleNetworkError(err, options.operation)
  }

  return {
    body: response.body,
    headers: response.headers,
    statusCode: response.status
  }
}
