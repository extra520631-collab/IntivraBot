import { cn } from '../../lib/cn'

export default function Progress({ value = 0, className, barClassName }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-ink-100', className)}>
      <div
        className={cn('h-full rounded-full bg-brand-600 transition-all', barClassName)}
        style={{ width: `${v}%` }}
      />
    </div>
  )
}

export function Ring({ value = 0, size = 88, stroke = 9, label }) {
  const v = Math.max(0, Math.min(100, value))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (v / 100) * c
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#ea580c"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      {/* Constrained to the ring's inner circle so a longer label wraps instead
          of running out under the stroke. */}
      <div
        className="absolute flex flex-col items-center px-1 text-center"
        style={{ maxWidth: size - stroke * 2 - 6 }}
      >
        <span className="text-lg font-bold leading-none text-ink-900">{v}%</span>
        {label && (
          <span className="mt-0.5 text-[10px] leading-tight text-ink-400">{label}</span>
        )}
      </div>
    </div>
  )
}
