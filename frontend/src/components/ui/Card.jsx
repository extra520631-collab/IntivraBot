import { cn } from '../../lib/cn'

export function Card({ className, children, ...props }) {
  return (
    <div className={cn('card-base', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ className, title, subtitle, action }) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4',
        className
      )}
    >
      <div>
        <h3 className="text-base font-semibold text-ink-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ className, children }) {
  return <div className={cn('p-5', className)}>{children}</div>
}
