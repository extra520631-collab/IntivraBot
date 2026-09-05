import { Link } from 'react-router-dom'
import { Briefcase, FileCheck2, Trophy, ArrowRight, Sparkles, TrendingUp } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ReferenceLine, AreaChart, Area,
} from 'recharts'
import StatCard from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'
import Progress from '../../components/ui/Progress'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import { useAuth } from '../../context/AuthContext'
import { shortDate } from '../../lib/format'

const statusTone = {
  applied: 'gray', screened: 'amber', shortlisted: 'green',
  interviewed: 'amber', passed: 'green', rejected: 'red',
}
// Chart colours mirror the status badges, so a slice and a pill for the same
// stage never disagree about what colour that stage is.
const STATUS_COLORS = {
  applied: '#cbd5e1',
  screened: '#fdba74',
  shortlisted: '#4ade80',
  interviewed: '#fb923c',
  passed: '#16a34a',
  rejected: '#f87171',
}
const checkLabels = {
  photo: 'Profile photo',
  resume: 'Resume uploaded',
  skills: 'Skills added',
  headline: 'Headline set',
}

export default function CandidateDashboard() {
  const { user } = useAuth()
  const { data, loading, error } = useFetch(() => api.get('/analytics/candidate'), [])
  const { data: jobsData } = useFetch(() => api.get('/jobs'), [])

  if (loading) return <div className="flex justify-center py-20 text-brand-600"><Spinner size={28} /></div>
  if (error) return <EmptyState title="Couldn’t load your dashboard" description={error} />
  if (!data) return <EmptyState title="Couldn’t load your dashboard" description="No data was returned. Try refreshing." />

  const {
    stats = { applications: 0, interviewsDone: 0, shortlisted: 0 },
    recent = [],
    profile = { completion: 0, checks: {} },
    scoreTrend = [],
    statusCounts = [],
    skillRadar = [],
    activityTrend = [],
  } = data
  const firstName = (user?.name || 'there').split(' ')[0]
  const recommended = (jobsData?.jobs || []).filter((j) => j.status === 'open').slice(0, 2)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Welcome banner */}
      <div className="overflow-hidden rounded-2xl bg-brand-600 p-6 text-white sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-bold">Welcome back, {firstName} 👋</h2>
            <p className="mt-1 text-brand-100">
              {profile.completion < 100
                ? `Your profile is ${profile.completion}% complete — finish it to stand out.`
                : 'Your profile is complete. Keep applying! 🎯'}
            </p>
          </div>
          <Button as={Link} to="/candidate/jobs" variant="secondary" className="shrink-0">
            Browse jobs <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Briefcase} label="Applications" value={stats.applications} tone="brand" />
        <StatCard icon={FileCheck2} label="Interviews done" value={stats.interviewsDone} tone="blue" />
        <StatCard icon={Trophy} label="Shortlisted" value={stats.shortlisted} tone="green" />
        {/* Only once there is a real score behind it — a bold "0%" on a new
            account reads as a verdict rather than an absence. */}
        <StatCard
          icon={TrendingUp}
          label="Avg interview score"
          value={stats.avgInterview != null ? `${stats.avgInterview}%` : '—'}
          tone="amber"
        />
      </div>

      {/* Charts, driven by this candidate's own applications. They stay on the
          page even with nothing behind them: the dashboard keeps one shape, and
          an empty chart still tells a new candidate what will be measured. */}
      {/* Two columns of equal weight — four charts pair off cleanly, and no
          card is left stranded on a row of its own. */}
      <div className="grid gap-6 lg:grid-cols-2">
          <div>
              <Card>
                <CardHeader
                  title="Your interview scores"
                  subtitle={
                    scoreTrend.length
                      ? `${scoreTrend.length} interview${scoreTrend.length === 1 ? '' : 's'} · ${stats.avgInterview}% average`
                      : 'Your scores appear here after your first interview'
                  }
                />
                <CardBody>
                  <div className="relative h-60">
                    {scoreTrend.length === 0 && <ChartEmpty text="No interviews yet" />}
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={scoreTrend} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="n" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                          labelFormatter={(_, p) => p?.[0]?.payload?.role || ''}
                        />
                        {/* The line most candidates are judged against. */}
                        <ReferenceLine y={75} stroke="#cbd5e1" strokeDasharray="4 4" />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="interview" name="Interview" stroke="#ea580c" strokeWidth={2.5} dot={{ r: 4, fill: '#ea580c' }} />
                        <Line type="monotone" dataKey="ats" name="Resume match" stroke="#60a5fa" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardBody>
              </Card>
            </div>

          {/* Effort over time. The score charts say how well they did; this one
              says how much they are actually putting out there, and the gap
              between the two areas is where applications stop converting. */}
          <Card>
            <CardHeader title="Your activity" subtitle="Applications and interviews, last 6 months" />
            <CardBody>
              <div className="relative h-60">
                {stats.applications === 0 && <ChartEmpty text="Apply to a job to start this" />}
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activityTrend} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gApplied" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ea580c" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#ea580c" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gInterviewed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="m" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone" dataKey="applied" name="Applied"
                      stroke="#ea580c" strokeWidth={2.5} fill="url(#gApplied)"
                    />
                    <Area
                      type="monotone" dataKey="interviewed" name="Interviewed"
                      stroke="#10b981" strokeWidth={2.5} fill="url(#gInterviewed)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>

          <Card>
              <CardHeader
                title="Where you stand"
                subtitle={stats.applications ? 'Every application' : 'No applications yet'}
              />
              <CardBody>
                <div className="relative h-60">
                  {stats.applications === 0 && <ChartEmpty text="Apply to a job to see this" />}
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusCounts} dataKey="value" nameKey="name" innerRadius={45} outerRadius={78} paddingAngle={3}>
                        {statusCounts.map((s) => (
                          <Cell key={s.name} fill={STATUS_COLORS[s.name] || '#e2e8f0'} />
                        ))}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 12, textTransform: 'capitalize' }} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>

          <Card>
              <CardHeader
                title="Your interview profile"
                subtitle={
                  stats.interviewsDone
                    ? 'Averaged across every completed interview'
                    : 'What each interview measures'
                }
              />
              <CardBody>
                <div className="relative h-60">
                  {stats.interviewsDone === 0 && <ChartEmpty text="Take an interview to fill this in" />}
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={skillRadar} outerRadius="72%">
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar dataKey="value" stroke="#ea580c" fill="#fb923c" fillOpacity={0.45} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>
        </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Applications */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Recent applications" subtitle="Your latest activity" action={<Link to="/candidate/results" className="text-sm font-semibold text-brand-600">View all</Link>} />
            <CardBody className="p-0">
              {recent.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-ink-500">No applications yet.</p>
                  <Button as={Link} to="/candidate/jobs" variant="secondary" size="sm" className="mt-3">Browse jobs</Button>
                </div>
              ) : (
                <div className="divide-y divide-ink-100">
                  {recent.map((a) => (
                    <div key={a.id} className="flex items-center justify-between px-5 py-4">
                      <div>
                        <div className="font-medium text-ink-900">{a.job}</div>
                        <div className="text-xs text-ink-500">{a.company || '—'} · Applied {shortDate(a.date)}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="hidden text-right sm:block">
                          <div className="text-sm font-bold text-ink-900">{a.score != null ? `${a.score}%` : '—'}</div>
                          <div className="text-[10px] text-ink-400">score</div>
                        </div>
                        <Badge tone={statusTone[a.status] || 'gray'}>{a.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Profile strength + recommended */}
        <div className="space-y-6">
          <Card>
            <CardBody>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <Sparkles className="h-4 w-4 text-brand-600" /> Profile strength
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-ink-500">{profile.completion}% complete</span>
                <span className="font-semibold text-brand-600">
                  {profile.completion === 100 ? 'Complete' : profile.completion >= 50 ? 'Almost there' : 'Getting started'}
                </span>
              </div>
              <Progress value={profile.completion} className="mt-2" />
              <ul className="mt-4 space-y-2 text-sm text-ink-600">
                {Object.entries(checkLabels).map(([key, label]) => (
                  <li key={key}>{profile.checks[key] ? '✅' : '⬜'} {label}</li>
                ))}
              </ul>
              {profile.completion < 100 && (
                <Button as={Link} to="/candidate/profile" variant="secondary" size="sm" className="mt-3 w-full">
                  Complete profile
                </Button>
              )}
            </CardBody>
          </Card>

          {recommended.length > 0 && (
            <Card>
              <CardHeader title="Recommended" subtitle="Open roles for you" />
              <CardBody className="space-y-3">
                {recommended.map((j) => (
                  <Link key={j._id} to={`/candidate/jobs/${j._id}`} className="block rounded-lg border border-ink-100 p-3 hover:border-brand-200 hover:bg-brand-50/40">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-ink-900">{j.title}</div>
                      <Badge tone="brand">{j.type}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500">{j.company || '—'} · {j.location}</div>
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// Sits over an empty chart's axes rather than replacing the chart. The grid
// stays visible behind it, so the card keeps its shape and the candidate can
// see what will fill in — a blank card just looks broken.
function ChartEmpty({ text }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <span className="rounded-full bg-white/85 px-3 py-1.5 text-xs font-medium text-ink-400 backdrop-blur-sm">
        {text}
      </span>
    </div>
  )
}
