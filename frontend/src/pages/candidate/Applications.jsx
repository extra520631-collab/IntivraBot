import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock, XCircle, FileText, Briefcase, Mic } from 'lucide-react'
import { Card, CardBody } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import { shortDate } from '../../lib/format'

const flow = ['Applied', 'Screened', 'Interviewed', 'Decision']

// Map backend status -> timeline index + how to render it.
const statusMeta = {
  applied: { idx: 0, label: 'Applied', tone: 'gray', icon: Clock },
  screened: { idx: 1, label: 'Screened', tone: 'amber', icon: Clock },
  interviewed: { idx: 2, label: 'Interviewed', tone: 'amber', icon: Clock },
  shortlisted: { idx: 3, label: 'Shortlisted', tone: 'green', icon: CheckCircle2 },
  passed: { idx: 3, label: 'Passed', tone: 'green', icon: CheckCircle2 },
  rejected: { idx: 3, label: 'Not passed', tone: 'red', icon: XCircle },
}

export default function CandidateApplications() {
  const navigate = useNavigate()
  const { data, loading, error } = useFetch(() => api.get('/applications/mine'), [])
  const applications = data?.applications || []

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">My Applications</h2>
        <p className="text-sm text-ink-500">Track the live status of every application.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-brand-600"><Spinner size={26} /></div>
      ) : error ? (
        <EmptyState icon={XCircle} title="Couldn't load applications" description={error} />
      ) : applications.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No applications yet"
          description="Browse open roles and apply — your ATS match is scored instantly."
          action={<Button as={Link} to="/candidate/jobs">Browse jobs</Button>}
        />
      ) : (
        <div className="space-y-4">
          {applications.map((a) => {
            const meta = statusMeta[a.status] || statusMeta.applied
            const Icon = meta.icon
            const failed = a.status === 'rejected'
            return (
              <Card key={a._id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-ink-900">{a.job?.title || 'Job'}</h3>
                        <Badge tone={meta.tone}><Icon className="h-3 w-3" /> {meta.label}</Badge>
                      </div>
                      <p className="text-xs text-ink-500">
                        {a.job?.company || '—'} · Applied {shortDate(a.createdAt)}
                        {a.atsScore != null && <> · ATS {a.atsScore}%</>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {a.interviewScore == null && !failed ? (
                        <Button
                          size="sm"
                          onClick={() => navigate('/candidate/interview', { state: { applicationId: a._id } })}
                        >
                          <Mic className="h-3.5 w-3.5" /> Start interview
                        </Button>
                      ) : a.interviewId ? (
                        <Button as={Link} to={`/candidate/results?id=${a.interviewId}`} variant="soft" size="sm">
                          <FileText className="h-3.5 w-3.5" /> Report
                        </Button>
                      ) : (
                        // A score exists but no matching interview record was found for
                        // this application — don't send the candidate to the unrelated
                        // full reports list and imply it's the right one.
                        <Button variant="soft" size="sm" disabled title="This report couldn't be located — contact support">
                          <FileText className="h-3.5 w-3.5" /> Report unavailable
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Progress timeline */}
                  <div className="mt-5 flex items-center">
                    {flow.map((s, i) => {
                      const done = i <= meta.idx
                      const isFailNode = failed && i === 3
                      return (
                        <div key={s} className="flex flex-1 items-center last:flex-none">
                          <div className="flex flex-col items-center">
                            <div className={
                              'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ' +
                              (isFailNode ? 'bg-red-100 text-red-600' : done ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-400')
                            }>
                              {done ? '✓' : i + 1}
                            </div>
                            <span className={'mt-1 text-[10px] ' + (done ? 'text-ink-600' : 'text-ink-400')}>{s}</span>
                          </div>
                          {i < flow.length - 1 && (
                            <div className={'mx-1 h-0.5 flex-1 ' + (i < meta.idx ? 'bg-brand-600' : 'bg-ink-200')} />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {failed && (
                    <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                      This application didn&apos;t cross the pass threshold. See the report for feedback.
                    </p>
                  )}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
