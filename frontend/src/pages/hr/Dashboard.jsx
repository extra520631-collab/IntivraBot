import { Link } from 'react-router-dom'
import { Users, UserCheck, Briefcase, Trophy, ArrowRight, AlertTriangle } from 'lucide-react'
import StatCard from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  Legend, ScatterChart, Scatter, ZAxis, ReferenceLine,
} from 'recharts'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import { useAuth } from '../../context/AuthContext'

const statusTone = {
  applied: 'gray', screened: 'amber', shortlisted: 'green',
  interviewed: 'amber', passed: 'green', rejected: 'red',
}

export default function HrDashboard() {
  const { user } = useAuth()
  const { data, loading, error } = useFetch(() => api.get('/analytics/hr'), [])

  if (loading) return <div className="flex justify-center py-20 text-brand-600"><Spinner size={28} /></div>
  if (error) return <EmptyState title="Couldn’t load your dashboard" description={error} />

  const { stats, funnel, flagged, recent, byJob = [], atsVsInterview = [] } = data
  const noData = stats.total === 0

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Recruitment overview</h2>
          <p className="text-sm text-ink-500">
            {user?.company || 'Your company'} · {stats.activeJobs} active job{stats.activeJobs === 1 ? '' : 's'}
          </p>
        </div>
        <Button as={Link} to="/hr/post-job">Post a new job <ArrowRight className="h-4 w-4" /></Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total applicants" value={stats.total} tone="brand" />
        <StatCard icon={UserCheck} label="Eligible" value={stats.eligible} tone="blue" />
        <StatCard icon={Briefcase} label="Interviewed" value={stats.interviewed} tone="amber" />
        <StatCard icon={Trophy} label="Passed" value={stats.passed} tone="green" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
          {/* Funnel chart */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader
                title="Hiring funnel"
                subtitle={noData ? 'No applicants yet' : 'Across all your jobs'}
              />
              <CardBody>
                <div className="relative h-64">
                  {noData && <ChartEmpty text="Your funnel fills in as candidates apply" />}
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnel} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="stage" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: '#fff7ed' }} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {funnel.map((_, i) => (
                          <Cell key={i} fill={i === funnel.length - 1 ? '#ea580c' : '#fdba74'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Fraud alerts */}
          <div className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader title="Fraud alerts" subtitle="Needs review" />
              <CardBody className="space-y-3">
                {flagged.length === 0 ? (
                  <p className="text-sm text-ink-500">No verification flags — all clear. 🎉</p>
                ) : (
                  flagged.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <div>
                          <div className="text-sm font-semibold text-ink-900">{a.name}</div>
                          <div className="text-xs text-ink-500">{a.flags} verification flag{a.flags === 1 ? '' : 's'}</div>
                        </div>
                      </div>
                      <Link to={`/hr/report/${a.id}`} className="text-xs font-semibold text-brand-600">Review</Link>
                    </div>
                  ))
                )}
                <p className="text-xs text-ink-400">Flags: face mismatch, multiple speakers, or repeated text mode.</p>
              </CardBody>
            </Card>
          </div>
        </div>

      {/* Two questions the funnel above can't answer: which of my roles is
          working, and is the resume screen actually predicting anything. Both
          stay on the page with nothing behind them, so the dashboard keeps one
          shape and an employer can see what will appear. */}
      <div className="grid gap-6 lg:grid-cols-2">
          <Card>
              <CardHeader
                title="By job"
                subtitle={byJob.length ? 'Applicants and average interview score' : 'No applicants yet'}
              />
              <CardBody>
                <div className="relative h-64">
                  {byJob.length === 0 && <ChartEmpty text="Post a job and collect applicants" />}
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byJob} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="job" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: '#fff7ed' }} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="applicants" name="Applicants" fill="#fdba74" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="avgScore" name="Avg score" fill="#ea580c" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>

          <Card>
              <CardHeader
                title="Resume score vs interview score"
                subtitle={
                  atsVsInterview.length
                    ? `${atsVsInterview.length} candidate${atsVsInterview.length === 1 ? '' : 's'} who did both`
                    : 'Needs candidates who have applied and interviewed'
                }
              />
              <CardBody>
                <div className="relative h-64">
                  {atsVsInterview.length === 0 && <ChartEmpty text="No completed interviews yet" />}
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        type="number" dataKey="ats" name="Resume" domain={[0, 100]}
                        tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                      />
                      <YAxis
                        type="number" dataKey="interview" name="Interview" domain={[0, 100]}
                        tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                      />
                      <ZAxis range={[70, 70]} />
                      {/* Above this line, they interviewed better than their CV predicted. */}
                      <ReferenceLine
                        segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
                        stroke="#cbd5e1" strokeDasharray="4 4" ifOverflow="extendDomain"
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                        formatter={(v, n) => [`${v}%`, n]}
                        labelFormatter={() => ''}
                      />
                      <Scatter data={atsVsInterview} fill="#ea580c" fillOpacity={0.7} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-xs text-ink-400">
                  Dots above the dashed line interviewed better than their resume predicted.
                </p>
              </CardBody>
            </Card>
        </div>

      {/* Recent candidates */}
      {recent.length > 0 && (
        <Card>
          <CardHeader title="Recent candidates" action={<Link to="/hr/applications" className="text-sm font-semibold text-brand-600">View all</Link>} />
          <CardBody className="p-0">
            <div className="divide-y divide-ink-100">
              {recent.map((a) => (
                <Link key={a.id} to={`/hr/report/${a.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-ink-50/50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-sm font-semibold text-ink-600">
                      {(a.name || '?').split(' ').map((s) => s[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink-900">{a.name}</div>
                      <div className="text-xs text-ink-500">{a.role}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="hidden text-right sm:block">
                      <div className="text-sm font-bold text-ink-900">{a.interviewScore != null ? `${a.interviewScore}%` : '—'}</div>
                      <div className="text-[10px] text-ink-400">interview</div>
                    </div>
                    <Badge tone={statusTone[a.status] || 'gray'}>{a.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

// Sits over an empty chart's axes rather than replacing the chart, so the card
// keeps its shape and an employer can see what will fill in.
function ChartEmpty({ text }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <span className="rounded-full bg-white/85 px-3 py-1.5 text-xs font-medium text-ink-400 backdrop-blur-sm">
        {text}
      </span>
    </div>
  )
}
