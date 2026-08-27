import { cn } from '../../lib/cn'

export default function Logo({ className, showText = true, dark = false }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
        <span className="text-lg font-extrabold leading-none">iB</span>
      </div>
      {showText && (
        <span className={cn('text-lg font-extrabold tracking-tight', dark ? 'text-white' : 'text-ink-900')}>
          Intivra<span className="text-brand-600">Bot</span>
        </span>
      )}
    </div>
  )
}
