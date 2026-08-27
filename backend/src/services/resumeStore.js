import { privateDownloadUrl } from '../config/cloudinary.js'

// Pulling a stored CV back out of Cloudinary. Shared by the view endpoint and
// the backfill script so both resolve public_ids the same way.

// CVs uploaded before the public_id was recorded only have a delivery URL.
// Everything after the version segment is the public_id.
export function publicIdFromUrl(url = '') {
  const match = /\/raw\/upload\/(?:v\d+\/)?(.+)$/.exec(url)
  if (!match) return null
  return decodeURIComponent(match[1].split('?')[0])
}

// Those same legacy files were stored with no extension, so the format has to
// come from the bytes themselves.
export function sniffExt(buffer) {
  const head = buffer.subarray(0, 4).toString('latin1')
  if (head.startsWith('%PDF')) return 'pdf'
  if (head.startsWith('PK')) return 'docx' // zip container
  return 'txt'
}

/**
 * Download a candidate's CV bytes.
 *
 * Returns { buffer, publicId, ext } on success, or { error, status } when the
 * file can't be fetched — callers decide how to surface that.
 */
export async function fetchResume(profile = {}) {
  const stored = profile.resumePublicId || publicIdFromUrl(profile.resumeUrl)
  if (!stored) return { error: 'none', status: 404 }

  // Records written before the public_id fix had the extension stripped off,
  // which Cloudinary can't resolve — try it back on first, then the id as
  // stored (right for both new uploads and the oldest, extension-less ones).
  const candidates = [...new Set([
    profile.resumeExt && !/\.[^./]+$/.test(stored) ? `${stored}.${profile.resumeExt}` : null,
    stored,
  ].filter(Boolean))]

  let lastStatus
  for (const id of candidates) {
    let upstream
    try {
      // The extension lives in the public_id for raw assets, so format is
      // always empty here — passing one makes Cloudinary look up a miss.
      upstream = await fetch(privateDownloadUrl(id, ''))
    } catch {
      return { error: 'unreachable', status: 0 }
    }
    if (upstream.ok) {
      const buffer = Buffer.from(await upstream.arrayBuffer())
      return { buffer, publicId: id, ext: profile.resumeExt || sniffExt(buffer) }
    }
    lastStatus = upstream.status
  }
  return { error: 'missing', status: lastStatus }
}
