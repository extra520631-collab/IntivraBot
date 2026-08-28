// Shared job display helpers, used by the HR form and every candidate-facing
// view so a salary or deadline never renders two different ways.

const CURRENCY_SYMBOLS = {
  PKR: '₨', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SAR: 'SAR ', INR: '₹',
}

const PERIOD_LABELS = { month: '/month', year: '/year', hour: '/hour' }

/** Compact money: 120000 -> "120k", 1500000 -> "1.5M". */
function compact(n) {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`
  }
  if (n >= 1_000) {
    const k = n / 1_000
    return `${k % 1 === 0 ? k : k.toFixed(1)}k`
  }
  return String(n)
}

/**
 * One-line pay summary, or null when there is nothing to show — an undisclosed
 * job and a job with no range entered both return null so callers can hide the
 * row entirely rather than printing an empty label.
 */
export function formatSalary(job) {
  if (!job || job.salaryDisclosed === false) return null
  const { salaryMin: min, salaryMax: max } = job
  if (min == null && max == null) return null

  const symbol = CURRENCY_SYMBOLS[job.salaryCurrency] ?? `${job.salaryCurrency || ''} `
  const period = PERIOD_LABELS[job.salaryPeriod] || ''

  // The prefix has to sit outside the symbol — "From ₨1.5M", never "₨From 1.5M".
  if (min != null && max != null) {
    const range = min === max ? compact(min) : `${compact(min)} – ${symbol}${compact(max)}`
    return `${symbol}${range}${period}`
  }
  if (min != null) return `From ${symbol}${compact(min)}${period}`
  return `Up to ${symbol}${compact(max)}${period}`
}

/** Days until the deadline; negative once it has passed, null when unset. */
export function daysUntil(deadline) {
  if (!deadline) return null
  const ms = new Date(deadline).getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}

/** Human deadline note, or null when there is no deadline. */
export function formatDeadline(deadline) {
  const days = daysUntil(deadline)
  if (days == null) return null
  if (days < 0) return 'Applications closed'
  if (days === 0) return 'Closes today'
  if (days === 1) return 'Closes tomorrow'
  if (days <= 7) return `Closes in ${days} days`
  return `Closes ${new Date(deadline).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/** A deadline within a week is worth calling out in amber. */
export function isDeadlineSoon(deadline) {
  const days = daysUntil(deadline)
  return days != null && days >= 0 && days <= 7
}

/** <input type="date"> wants YYYY-MM-DD; the API returns an ISO timestamp. */
export function toDateInput(value) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}
