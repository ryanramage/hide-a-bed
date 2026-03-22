const ensureDirectoryUrl = (value: string | URL) => {
  const url = new URL(value)

  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`
  }

  return url
}

export const createCouchDbUrl = (value: string | URL) => {
  return new URL(value)
}

export const createCouchPathUrl = (path: string, base: string | URL) => {
  return new URL(path, ensureDirectoryUrl(base))
}

export const createCouchDocUrl = (docId: string, base: string | URL) => {
  return new URL(encodeURIComponent(docId), ensureDirectoryUrl(base))
}
