import { Link } from 'react-router-dom'
import { Briefcase, FileCheck2, Trophy, ArrowRight, Sparkles } from 'lucide-react'
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
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Briefcase} label="Applications" value={stats.applications} tone="brand" />
        <StatCard icon={FileCheck2} label="Interviews done" value={stats.interviewsDone} tone="blue" />
        <StatCard icon={Trophy} label="Shortlisted" value={stats.shortlisted} tone="green" />
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
