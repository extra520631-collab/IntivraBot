// Tiny classnames helper (no external dependency)
export function cn(...args) {
  return args.filter(Boolean).join(' ')
}
