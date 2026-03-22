type JsonResponse<TBody = Record<string, unknown> | null> = {
  body: TBody
  statusCode: number
}

async function parseJsonBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function requestJson<TBody = Record<string, unknown> | null>(
  method: 'DELETE' | 'GET' | 'POST' | 'PUT',
  url: string,
  body?: unknown
): Promise<JsonResponse<TBody>> {
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    body: body == null ? undefined : JSON.stringify(body)
  })

  return {
    body: (await parseJsonBody(response)) as TBody,
    statusCode: response.status
  }
}

export const getJson = <TBody = Record<string, unknown> | null,>(url: string) =>
  requestJson<TBody>('GET', url)
export const putJson = <TBody = Record<string, unknown> | null,>(url: string, body?: unknown) =>
  requestJson<TBody>('PUT', url, body)
