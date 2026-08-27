import { Bell, CheckCircle2, Briefcase, FileText, AlertTriangle, UserCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardBody } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import { useNotifications } from '../../context/NotificationContext'

const typeStyle = {
  application: { icon: Briefcase, tone: 'text-sky-600 bg-sky-50' },
  status: { icon: UserCheck, tone: 'text-emerald-600 bg-emerald-50' },
  interview: { icon: FileText, tone: 'text-brand-600 bg-brand-50' },
  flag: { icon: AlertTriangle, tone: 'text-amber-600 bg-amber-50' },
  info: { icon: CheckCircle2, tone: 'text-ink-500 bg-ink-100' },
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function Notifications() {
  const { notifications, unread, markAllRead, markRead } = useNotifications()

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Notifications</h2>
          <p className="text-sm text-ink-500">{unread} unread</p>
        </div>
        <Button variant="secondary" size="sm" onClick={markAllRead} disabled={unread === 0}>
          Mark all as read
        </Button>
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet" description="Updates about your applications and interviews will appear here in real time." />
      ) : (
        <Card>
          <CardBody className="p-0">
            <div className="divide-y divide-ink-100">
              {notifications.map((n) => {
                const style = typeStyle[n.type] || typeStyle.info
                const Icon = style.icon
                const row = (
                  <div className={'flex gap-3 px-5 py-4 ' + (n.read ? '' : 'bg-brand-50/30')}>
                    <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ' + style.tone}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-ink-900">{n.title}</p>
                        {!n.read && <span className="h-2 w-2 rounded-full bg-brand-600" />}
                      </div>
                      {n.body && <p className="text-sm text-ink-500">{n.body}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-ink-400">{timeAgo(n.createdAt)}</span>
                  </div>
                )
                return n.link ? (
                  <Link key={n._id} to={n.link} onClick={() => !n.read && markRead(n._id)} className="block hover:bg-ink-50/50">
                    {row}
                  </Link>
                ) : (
                  <button key={n._id} onClick={() => !n.read && markRead(n._id)} className="block w-full text-left hover:bg-ink-50/50">
                    {row}
                  </button>
                )
              })}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
