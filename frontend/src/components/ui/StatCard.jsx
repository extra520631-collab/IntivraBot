import { cn } from '../../lib/cn'

export default function StatCard({ icon: Icon, label, value, delta, tone = 'brand' }) {
  const toneMap = {
    brand: 'bg-brand-50 text-brand-600',
    green: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-sky-50 text-sky-600',
    amber: 'bg-amber-50 text-amber-600',
  }
  return (
    <div className="card-base p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink-500">{label}</span>
        {Icon && (
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneMap[tone])}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-2xl font-bold text-ink-900">{value}</span>
        {delta && <span className="mb-1 text-xs font-semibold text-emerald-600">{delta}</span>}
      </div>
    </div>
  )
}
