// Relative time like "2 days ago" from an ISO date string.
export function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const secs = Math.max(1, Math.floor((Date.now() - then) / 1000))
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [name, s] of units) {
    const n = Math.floor(secs / s)
    if (n >= 1) return `${n} ${name}${n > 1 ? 's' : ''} ago`
  }
  return 'just now'
}

// Short date like "Aug 6" from an ISO string.
export function shortDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
