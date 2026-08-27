// Tiny fetch wrapper around the IntivraBot backend.
// - injects the Bearer token from localStorage
// - normalizes errors into thrown Error(message) with .status and .details

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
const TOKEN_KEY = 'ib_token'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = tokenStore.get()
  if (auth && token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?')
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    /* no JSON body */
  }

  if (!res.ok) {
    const err = new Error(data?.message || `Request failed (${res.status})`)
    err.status = res.status
    err.details = data?.details
    throw err
  }
  return data
}

// Multipart upload — sends a File under the given field. The browser sets the
// multipart Content-Type (with boundary) itself, so we don't set it here.
async function upload(path, file, field = 'file') {
  const form = new FormData()
  form.append(field, file)

  const headers = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: form })
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?')
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    /* no JSON body */
  }
  if (!res.ok) {
    const err = new Error(data?.message || `Upload failed (${res.status})`)
    err.status = res.status
    err.details = data?.details
    throw err
  }
  return data
}

// Fetches a binary response (e.g. a CV) as an object URL. Needed because a
// plain <a href> can't carry the Authorization header. Callers must revoke the
// URL when they're done with it.
async function blobUrl(path) {
  const headers = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${BASE}${path}`, { headers })
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?')
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      message = (await res.json())?.message || message
    } catch { /* not JSON */ }
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return URL.createObjectURL(await res.blob())
}

export const api = {
  get: (p, opt) => request(p, { ...opt, method: 'GET' }),
  post: (p, body, opt) => request(p, { ...opt, method: 'POST', body }),
  put: (p, body, opt) => request(p, { ...opt, method: 'PUT', body }),
  patch: (p, body, opt) => request(p, { ...opt, method: 'PATCH', body }),
  del: (p, opt) => request(p, { ...opt, method: 'DELETE' }),
  upload,
  blobUrl,
}
