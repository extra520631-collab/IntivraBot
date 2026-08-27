// Shared helpers for matching a free-text `company` name case-insensitively
// and safely (escaped, so a company name with regex metacharacters can't
// turn into an unintended pattern).

export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function companyRegex(company) {
  return new RegExp(`^${escapeRegex(company.trim())}$`, 'i')
}
