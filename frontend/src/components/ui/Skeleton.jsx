import { cn } from '../../lib/cn'

export default function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-ink-100', className)} />
}

// Ready-made card skeleton row for lists (jobs, applications, etc.)
export function CardSkeleton() {
  return (
    <div className="card-base space-y-3 p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
    </div>
  )
}
