import { cn } from '../../lib/cn'

const variants = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm',
  secondary:
    'bg-white text-ink-900 border border-ink-200 hover:bg-ink-50 active:bg-ink-100',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  ghost: 'bg-transparent text-ink-700 hover:bg-ink-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
}

const sizes = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

export default function Button({
  as: Comp = 'button',
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}) {
  return (
    <Comp
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-semibold transition',
        'focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  )
}
