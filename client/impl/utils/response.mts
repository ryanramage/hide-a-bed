export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === 'object'
}

export type CouchSuccessProfile =
  | 'bulkGet'
  | 'bulkSave'
  | 'changesFeed'
  | 'database'
  | 'documentDelete'
  | 'documentRead'
  | 'documentWrite'
  | 'viewQuery'
  | 'viewStream'

const SUCCESS_STATUS_CODES: Record<CouchSuccessProfile, readonly number[]> = {
  bulkGet: [200],
  bulkSave: [201, 202],
  changesFeed: [200],
  database: [200],
  documentDelete: [200, 202],
  documentRead: [200],
  documentWrite: [200, 201, 202],
  viewQuery: [200],
  viewStream: [200]
}

export const getReason = (value: unknown, fallback: string) => {
  if (!isRecord(value) || typeof value.reason !== 'string') {
    return fallback
  }

  return value.reason
}

export const getCouchError = (value: unknown) => {
  if (!isRecord(value) || typeof value.error !== 'string') {
    return undefined
  }

  return value.error
}

export const getSuccessStatusCodes = (profile: CouchSuccessProfile) => {
  return SUCCESS_STATUS_CODES[profile]
}

export const isSuccessStatusCode = (profile: CouchSuccessProfile, statusCode: number) => {
  return SUCCESS_STATUS_CODES[profile].includes(statusCode)
}
