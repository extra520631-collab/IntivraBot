import { useState } from 'react'
import { Lock, Eye, EyeOff } from 'lucide-react'
import { cn } from '../../lib/cn'

// Simple, dependency-free password strength scoring (0–4).
export function scorePassword(pw = '') {
  let score = 0
  if (!pw) return 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return Math.min(score, 4)
}

const strengthMeta = [
  { label: 'Too weak', color: 'bg-red-500', text: 'text-red-600' },
  { label: 'Weak', color: 'bg-red-500', text: 'text-red-600' },
  { label: 'Fair', color: 'bg-amber-500', text: 'text-amber-600' },
  { label: 'Good', color: 'bg-lime-500', text: 'text-lime-600' },
  { label: 'Strong', color: 'bg-green-500', text: 'text-green-600' },
]

export default function PasswordInput({
  label = 'Password',
  value,
  onChange,
  error,
  hint,
  showMeter = false,
  className,
  id = 'password',
  ...props
}) {
  const [visible, setVisible] = useState(false)
  const score = showMeter ? scorePassword(value) : 0
  const meta = strengthMeta[score]

  return (
    <div className={className}>
      {label && <label htmlFor={id} className="label-base">{label}</label>}
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          className={cn('input-base pl-9 pr-10', error && 'border-red-400 focus:ring-red-100')}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-600"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {showMeter && value && (
        <div className="mt-2">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn('h-1.5 flex-1 rounded-full transition-colors', i < score ? meta.color : 'bg-ink-100')}
              />
            ))}
          </div>
          <p className={cn('mt-1 text-xs font-medium', meta.text)}>{meta.label}</p>
        </div>
      )}

      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  )
}
