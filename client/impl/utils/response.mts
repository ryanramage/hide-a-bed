export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === 'object'
}

export const getReason = (value: unknown, fallback: string) => {
  if (!isRecord(value) || typeof value.reason !== 'string') {
    return fallback
  }

  return value.reason
}
