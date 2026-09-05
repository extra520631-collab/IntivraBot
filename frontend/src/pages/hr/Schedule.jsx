import { Link } from 'react-router-dom'
import { Clock, FileText, Loader2, Activity, Info } from 'lucide-react'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import { cn } from '../../lib/cn'

function timeLabel(date) {
  const d = new Date(date)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return sameDay ? `Today · ${time}` : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`
}

export default function Schedule() {
  const { data, loading, error } = useFetch(() => api.get('/interviews/hr/schedule'), [])

  if (loading) return <div className="flex justify-center py-20 text-brand-600"><Spinner size={28} /></div>
  if (error) return <EmptyState title="Couldn’t load your schedule" description={error} />

  const { week, inProgress, recent } = data
  const nothing = inProgress.length === 0 && recent.length === 0
  const maxCount = Math.max(1, ...week.map((w) => w.count))

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Interview Activity</h2>
        <p className="text-sm text-ink-500">
          Interviews across your jobs — live, and recently finished
        </p>
      </div>

      {/* HR arrives here expecting to book slots. Nothing is booked: a
          candidate starts their interview whenever they choose and the AI runs
          it unattended, so say that once rather than leaving them hunting for
          a button that does not exist. */}
      <p className="flex items-start gap-2 rounded-lg border border-ink-200 bg-ink-50/60 px-3.5 py-2.5 text-xs leading-relaxed text-ink-600">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
        <span>
          There is nothing to schedule. Candidates take their AI interview
          whenever they like, and you don&apos;t need to attend — results land
          in <Link to="/hr/applications" className="font-semibold text-brand-600 hover:underline">Applications</Link>.
          What each interview asks and requires is set on the job itself.
        </span>
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Week strip */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="This week" subtitle="Interviews candidates took each day" />
            <CardBody>
              <div className="grid grid-cols-7 gap-2">
                {week.map((w) => (
                  <div key={w.day} className="text-center">
                    <div className="text-xs font-medium text-ink-400">{w.day}</div>
                    <div className={cn(
                      'mt-1 flex h-20 flex-col items-center justify-center rounded-lg border',
                      w.count ? 'border-brand-200 bg-brand-50' : 'border-ink-100'
                    )}>
                      <span className="text-sm font-semibold text-ink-900">{w.date}</span>
                      {w.count ? (
                        <span
                          className="mt-1 rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white"
                          title={`${w.count} interview${w.count === 1 ? '' : 's'}`}
                          style={{ opacity: 0.5 + 0.5 * (w.count / maxCount) }}
                        >
                          {w.count}
                        </span>
                      ) : (
                        <span className="mt-1 text-[10px] text-ink-300">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Live now */}
        <div>
          <Card className="h-full">
            <CardHeader title="Live now" subtitle={`${inProgress.length} in progress`} />
            <CardBody className="space-y-3">
              {inProgress.length === 0 ? (
                <p className="text-sm text-ink-500">No interviews in progress right now.</p>
              ) : (
                inProgress.map((u) => (
                  <div key={u.id} className="rounded-lg border border-brand-200 bg-brand-50/40 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-ink-900">{u.candidate}</span>
                      <Badge tone="amber"><Loader2 className="h-3 w-3 animate-spin" /> Live</Badge>
                    </div>
                    <p className="text-xs text-ink-500">{u.role}</p>
                    <span className="mt-2 flex items-center gap-1 text-xs text-ink-500">
                      <Clock className="h-3.5 w-3.5" /> Started {timeLabel(u.startedAt)}
                    </span>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Recent completed */}
      <Card>
        <CardHeader title="Recently completed" />
        <CardBody className="space-y-3">
          {nothing ? (
            <EmptyState icon={Activity} title="No interviews yet" description="When candidates take AI interviews for your jobs, they show up here." />
          ) : recent.length === 0 ? (
            <p className="text-sm text-ink-500">No completed interviews yet.</p>
          ) : (
            recent.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg border border-ink-100 p-3">
                <div>
                  <div className="text-sm font-semibold text-ink-900">{u.candidate}</div>
                  <p className="text-xs text-ink-500">{u.role} · {timeLabel(u.completedAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-ink-900">{u.overallScore != null ? `${u.overallScore}%` : '—'}</span>
                  {u.application && (
                    <Link to={`/hr/report/${u.application}`} className="flex items-center gap-1 text-xs font-semibold text-brand-600">
                      <FileText className="h-3.5 w-3.5" /> Report
                    </Link>
                  )}
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  )
}
