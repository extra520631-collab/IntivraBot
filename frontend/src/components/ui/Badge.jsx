import { cn } from '../../lib/cn'

const tones = {
  brand: 'bg-brand-50 text-brand-700',
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  gray: 'bg-ink-100 text-ink-700',
  blue: 'bg-sky-50 text-sky-700',
}

export default function Badge({ tone = 'gray', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
