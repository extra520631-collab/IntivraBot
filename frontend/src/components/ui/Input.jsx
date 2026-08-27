import { cn } from '../../lib/cn'

export function Input({ label, hint, error, className, id, ...props }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="label-base">
          {label}
        </label>
      )}
      <input id={id} className={cn('input-base', error && 'border-red-400 focus:ring-red-100')} {...props} />
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  )
}

export function Textarea({ label, hint, className, id, rows = 4, ...props }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="label-base">
          {label}
        </label>
      )}
      <textarea id={id} rows={rows} className="input-base resize-none" {...props} />
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  )
}

export function Select({ label, children, className, id, ...props }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="label-base">
          {label}
        </label>
      )}
      <select id={id} className="input-base cursor-pointer" {...props}>
        {children}
      </select>
    </div>
  )
}
