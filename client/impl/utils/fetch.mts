import { RetryableError } from './errors.mts'

export type HttpMethod = 'DELETE' | 'GET' | 'POST' | 'PUT'

export type FetchBody = BodyInit | Record<string, unknown> | Array<unknown> | null | undefined

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
  signal?: AbortSignal
  url: string
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

const encodeBody = (body: FetchBody) => {
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
    return body
  }

  return JSON.stringify(body)
}

const parseJsonResponse = async (response: Response): Promise<unknown> => {
  if (response.status === 204 || response.status === 205) {
    return null
  }

  return response.json()
}

export async function fetchCouchJson<TBody = unknown>(
  options: FetchRequestOptions
): Promise<FetchResult<TBody>> {
  let response: Response
  const { headers } = prepareRequest(options)

  try {
    response = await fetch(options.url, {
      method: options.method,
      headers: {
        ...JSON_HEADERS,
        ...headers
      },
      body: encodeBody(options.body),
      signal: options.signal
    })
  } catch (err) {
    if (isAbortError(err)) {
      throw err
    }

    RetryableError.handleNetworkError(err)
  }

  return {
    body: (await parseJsonResponse(response)) as TBody,
    headers: response.headers,
    statusCode: response.status
  }
}

export async function fetchCouchStream(
  options: FetchRequestOptions
): Promise<FetchResult<ReadableStream<Uint8Array> | null>> {
  let response: Response
  const { headers } = prepareRequest(options)

  try {
    response = await fetch(options.url, {
      method: options.method,
      headers,
      body: encodeBody(options.body),
      signal: options.signal
    })
  } catch (err) {
    if (isAbortError(err)) {
      throw err
    }

    RetryableError.handleNetworkError(err)
  }

  return {
    body: response.body,
    headers: response.headers,
    statusCode: response.status
  }
}
