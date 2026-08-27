import { TrendingUp, Award, Users, Target } from 'lucide-react'
import StatCard from '../../components/ui/StatCard'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'

const pieColors = ['#ea580c', '#fdba74', '#e2e8f0']

export default function Analytics() {
  const { data, loading, error } = useFetch(() => api.get('/analytics/hr'), [])

  if (loading) return <div className="flex justify-center py-20 text-brand-600"><Spinner size={28} /></div>
  if (error) return <EmptyState title="Couldn’t load analytics" description={error} />

  const { stats, scoreDistribution, outcome, topSkills, applicationsTrend } = data

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Analytics</h2>
        <p className="text-sm text-ink-500">Hiring performance across all your jobs</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total applicants" value={stats.total} tone="brand" />
        <StatCard icon={Target} label="Avg match score" value={`${stats.avgMatchScore}%`} tone="blue" />
        <StatCard icon={TrendingUp} label="Pass rate" value={`${stats.passRate}%`} tone="green" />
        <StatCard icon={Award} label="Avg interview score" value={`${stats.avgInterviewScore}%`} tone="amber" />
      </div>

      {stats.total === 0 ? (
        <EmptyState icon={Users} title="No data yet" description="Analytics populate as candidates apply and complete interviews." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Applications over time" subtitle="Last 6 months" />
            <CardBody>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={applicationsTrend} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ea580c" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#ea580c" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="m" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="v" name="Applications" stroke="#ea580c" strokeWidth={2.5} fill="url(#g)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Score distribution" subtitle="ATS match scores" />
            <CardBody>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scoreDistribution} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#fff7ed' }} />
                    <Bar dataKey="v" name="Candidates" fill="#fb923c" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Outcome split" />
            <CardBody>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={outcome} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                      {outcome.map((_, i) => <Cell key={i} fill={pieColors[i]} />)}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Top skills in applicant pool" subtitle="Share of applicants with each skill" />
            <CardBody className="space-y-3 pt-2">
              {topSkills.length === 0 ? (
                <p className="text-sm text-ink-500">No matched skills recorded yet.</p>
              ) : (
                topSkills.map(({ skill, pct }) => (
                  <div key={skill}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-ink-700">{skill}</span>
                      <span className="text-ink-500">{pct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  )
}
