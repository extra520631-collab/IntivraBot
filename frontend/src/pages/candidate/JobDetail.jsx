import { useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  MapPin, Briefcase, CheckCircle2, XCircle, ArrowLeft, FileText, Upload, Loader2,
  Wallet, CalendarDays, Users, GraduationCap, Laptop, Gift, ListChecks, Clock,
} from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { Card, CardBody } from '../../components/ui/Card'
import { Ring } from '../../components/ui/Progress'
import { Textarea } from '../../components/ui/Input'
import EmptyState from '../../components/ui/EmptyState'
import { cn } from '../../lib/cn'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import { useToast } from '../../context/ToastContext'
import { formatSalary, formatDeadline, isDeadlineSoon } from '../../lib/job'

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const { data, loading, error, reload } = useFetch(() => api.get(`/jobs/${id}`), [id])
  const job = data?.job

  const [resume, setResume] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadedName, setUploadedName] = useState('')
  // On success: { applicationId, atsScore, matchedSkills, passed }.
  // On rejection: { atsScore, matchedCount, requiredCount, passed: false }.
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File is too large (max 5 MB).')
      return
    }
    setUploading(true)
    try {
      const res = await api.upload('/uploads/resume', file)
      setUploadedName(file.name)
      if (res.text && res.text.trim().length >= 30) {
        setResume(res.text)
        // The CV now lives on the profile, so re-fetch the job to pick up the
        // match score the server just became able to compute.
        reload()
        toast.success('CV uploaded and read — here is your match for this role.')
      } else {
        toast.info?.('Resume saved, but we couldn’t read its text. Paste it below to score.')
      }
    } catch (err) {
      toast.error(err.message || 'Could not upload the resume')
    } finally {
      setUploading(false)
    }
  }

  const apply = async () => {
    setSubmitting(true)
    setResult(null)
    try {
      // The CV saved on the profile is what the server scores; pasted text is
      // only sent when the candidate deliberately overrode it.
      const body = { jobId: id }
      if (resume.trim().length >= 30) body.resumeText = resume
      const res = await api.post('/applications', body)
      const a = res.application
      setResult({ applicationId: a._id, atsScore: a.atsScore, matchedSkills: a.matchedSkills, missingSkills: [], passed: true })
      toast.success(
        a.atsScore != null
          ? `Applied! Your ATS match is ${a.atsScore}%.`
          : 'Applied! Your ATS match will show up shortly — the scoring service is temporarily unavailable.'
      )
      reload()
    } catch (err) {
      // 422 = below apply threshold. The server sends counts rather than the
      // missing skill names, so the rejection can be explained without
      // handing over a checklist to pad a CV with.
      if (err.status === 422 && err.details?.needsResume) {
        toast.error(err.message)
      } else if (err.status === 422 && err.details) {
        setResult({
          atsScore: err.details.atsScore,
          matchedCount: err.details.matchedCount ?? 0,
          requiredCount: err.details.requiredCount ?? 0,
          passed: false,
        })
        toast.error(err.message)
      } else {
        toast.error(err.message || 'Could not apply')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20 text-brand-600"><Spinner size={28} /></div>
  }
  if (error || !job) {
    return <EmptyState icon={XCircle} title="Job not found" description={error || 'This job may have been removed.'} action={<Button as={Link} to="/candidate/jobs" variant="secondary">Back to jobs</Button>} />
  }

  const alreadyApplied = job.hasApplied && !result
  const salary = formatSalary(job)
  const deadlineNote = formatDeadline(job.deadline)
  // The server rejects both cases, so the button should never invite the click.
  const closed = Boolean(job.isExpired) || job.status !== 'open'
  // Skill counts behind the percentage, so the score can be explained rather
  // than just asserted.
  // Counts come from the server: below the bar it withholds the skill names,
  // so they cannot be derived from missingSkills here.
  const matchedCount = job.matchedCount ?? job.matchedSkills?.length ?? 0
  const requiredCount = job.requiredCount ?? matchedCount + (job.missingSkills?.length || 0)
  const missingCount = requiredCount - matchedCount
  // Scored above the employer's bar. Deliberately not `job.eligible`, which is
  // also false on a closed job — someone who cleared the bar has earned the
  // detail either way; only those still below it see the count alone.
  const clearsBar = job.matchScore != null && job.matchScore >= job.applyThreshold

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link to="/candidate/jobs" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Back to jobs
      </Link>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Main */}
        <div className="space-y-5 lg:col-span-2">
          <div className="card-base p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-900">{job.title}</h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
                  <span>{job.company || '—'}</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location}</span>
                  <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{job.type}</span>
                  {job.workMode && <span className="flex items-center gap-1"><Laptop className="h-3.5 w-3.5" />{job.workMode}</span>}
                  {job.department && <span>{job.department}</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {job.experience && <Badge tone="brand">{job.experience}</Badge>}
                {job.isExpired && <Badge tone="red">Closed</Badge>}
              </div>
            </div>

            {/* Pay is the first thing most candidates look for. */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
                <Wallet className="h-4 w-4" />
                {salary || (job.salaryDisclosed === false ? 'Market competitive' : 'Salary not disclosed')}
              </span>
              {job.salaryNegotiable && (
                <span className="rounded-lg bg-ink-100 px-2.5 py-1.5 text-xs font-medium text-ink-600">Negotiable</span>
              )}
              {deadlineNote && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
                    job.isExpired
                      ? 'bg-red-50 text-red-700'
                      : isDeadlineSoon(job.deadline)
                        ? 'bg-amber-50 text-amber-800'
                        : 'bg-ink-100 text-ink-600'
                  )}
                >
                  <CalendarDays className="h-4 w-4" />
                  {deadlineNote}
                </span>
              )}
            </div>

            {/* At-a-glance facts */}
            <dl className="mt-5 grid gap-x-6 gap-y-2.5 border-y border-ink-100 py-4 sm:grid-cols-2">
              {[
                ['Openings', job.openings > 1 ? `${job.openings} positions` : '1 position', Users],
                ['Work mode', job.workMode || '—', Laptop],
                ['Experience', job.experience || 'Any', Clock],
                ['Education', job.education || 'No specific requirement', GraduationCap],
              ].map(([label, value, Icon]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-1.5 text-xs text-ink-500">
                    <Icon className="h-3.5 w-3.5 text-ink-400" />{label}
                  </dt>
                  <dd className="text-xs font-medium text-ink-900">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-ink-900">About the role</h3>
              <p className="mt-1.5 whitespace-pre-line text-sm text-ink-600">{job.description}</p>
            </div>

            {job.responsibilities?.length > 0 && (
              <div className="mt-5">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                  <ListChecks className="h-4 w-4 text-brand-600" /> What you&apos;ll do
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {job.responsibilities.map((r) => (
                    <li key={r} className="flex gap-2 text-sm text-ink-600">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {job.requirements?.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-ink-900">What they&apos;re looking for</h3>
                <ul className="mt-2 space-y-1.5">
                  {job.requirements.map((r) => (
                    <li key={r} className="flex gap-2 text-sm text-ink-600">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-300" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-ink-900">Required skills</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(job.skills || []).map((s) => (
                  <span key={s} className="rounded-md bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700">{s}</span>
                ))}
              </div>
            </div>

            {job.niceToHaveSkills?.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-ink-900">Nice to have</h3>
                <p className="mt-0.5 text-xs text-ink-400">Not counted against your match score.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {job.niceToHaveSkills.map((s) => (
                    <span key={s} className="rounded-md border border-dashed border-ink-300 px-2.5 py-1 text-xs font-medium text-ink-500">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {job.benefits?.length > 0 && (
              <div className="mt-5">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                  <Gift className="h-4 w-4 text-brand-600" /> Benefits &amp; perks
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {job.benefits.map((b) => (
                    <span key={b} className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{b}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: apply */}
        <div className="space-y-5">
          <Card>
            <CardBody>
              {alreadyApplied ? (
                <div className="text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-6 w-6" />
                  </span>
                  <p className="mt-3 font-semibold text-ink-900">You&apos;ve applied</p>
                  <p className="mt-1 text-sm text-ink-500">Track it in your applications.</p>
                  <Button as={Link} to="/candidate/applications" variant="secondary" className="mt-4 w-full">
                    <FileText className="h-4 w-4" /> My applications
                  </Button>
                </div>
              ) : result ? (
                <div className="flex flex-col items-center text-center">
                  {result.atsScore != null ? (
                    <Ring value={result.atsScore} label="ATS match" />
                  ) : (
                    <div className="flex h-[88px] w-[88px] flex-col items-center justify-center rounded-full border-4 border-dashed border-ink-200 text-center">
                      <span className="text-[10px] font-semibold leading-tight text-ink-400">Score<br />pending</span>
                    </div>
                  )}
                  {result.passed ? (
                    <>
                      <div className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" /> Application submitted
                      </div>
                      <Button size="lg" className="mt-4 w-full" onClick={() => navigate('/candidate/interview', { state: { applicationId: result.applicationId } })}>
                        Start AI Interview
                      </Button>
                      <Button as={Link} to="/candidate/applications" variant="ghost" size="sm" className="mt-2">
                        View my applications
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-red-600">
                        <XCircle className="h-4 w-4" /> Below the apply threshold ({job.applyThreshold}%)
                      </div>
                      {/* Below the gate, the count explains the decision but
                          the skill names are withheld: naming them here is a
                          list to paste into a CV, and a padded CV only fails
                          the interview that follows. */}
                      {result.requiredCount > 0 && (
                        <div className="mt-3 w-full rounded-lg bg-red-50 p-3 text-left">
                          <p className="text-xs font-semibold text-red-700">
                            {result.matchedCount} of {result.requiredCount} required skills found in your CV
                          </p>
                          <p className="mt-1.5 text-[11px] leading-relaxed text-red-600">
                            If your CV understates your experience, describe each project and what you
                            built, then try again. The AI interview checks depth, so adding skills you
                            have not used will not get you through.
                          </p>
                        </div>
                      )}
                      <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={() => setResult(null)}>
                        Edit resume & retry
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <h3 className="text-sm font-semibold text-ink-900">Apply to this job</h3>

                  {/* Your CV is already on file — show the score it earns here
                      instead of making the candidate paste it again. */}
                  {job.hasResume && job.matchScore != null ? (
                    <>
                      <div className="mt-4 flex flex-col items-center">
                        <Ring value={job.matchScore} size={104} label="CV match" />
                      </div>
                      {/* The ring alone does not say where the number came
                          from. Spell out the skill count that drives it. */}
                      {requiredCount > 0 && (
                        <div className="mt-4 w-full rounded-lg border border-ink-200 p-3">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs font-semibold text-ink-700">Skills matched</span>
                            <span className="text-sm font-bold text-ink-900">
                              {matchedCount}
                              <span className="font-medium text-ink-400"> / {requiredCount}</span>
                            </span>
                          </div>
                          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-ink-100">
                            <div
                              className="bg-emerald-500 transition-all"
                              style={{ width: `${(matchedCount / requiredCount) * 100}%` }}
                            />
                          </div>
                          {job.matchedSkills?.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1">
                              {job.matchedSkills.map((s) => (
                                <span
                                  key={s}
                                  className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                                >
                                  <CheckCircle2 className="h-3 w-3" />{s}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-3 w-full rounded-lg bg-ink-50 p-3 text-xs text-ink-500">
                        This employer requires{' '}
                        <span className="font-semibold text-ink-900">{job.applyThreshold}%</span>
                        {job.eligible
                          ? ' — you clear it.'
                          : job.matchScore >= job.applyThreshold
                            ? ' — you clear it, but this job has closed.'
                            : ` — you're ${job.applyThreshold - job.matchScore}% short.`}
                      </div>

                      {/* Who sees the gap list, and who only sees the count:
                          past the gate it is preparation for the interview,
                          below it the same list is a checklist to paste into a
                          CV. Both still get the count, so the score is always
                          explained. */}
                      {missingCount > 0 && (
                        <div className="mt-3 w-full rounded-lg bg-amber-50 p-3 text-left">
                          <p className="text-xs font-semibold text-amber-800">
                            {clearsBar
                              ? `Not found in your CV (${missingCount})`
                              : `${matchedCount} of ${requiredCount} required skills found in your CV`}
                          </p>

                          {clearsBar && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {job.missingSkills.map((s) => (
                                <span key={s} className="rounded bg-white px-2 py-0.5 text-xs text-amber-700">{s}</span>
                              ))}
                            </div>
                          )}

                          <p className="mt-2 text-[11px] leading-relaxed text-amber-700">
                            {clearsBar
                              ? 'Worth mentioning in the interview if you have real experience with these.'
                              : 'If your CV understates your experience, describe each project and what you built, then reload. The AI interview checks depth, so adding skills you have not used will not get you through.'}
                          </p>
                        </div>
                      )}

                      <Button
                        size="lg"
                        className="mt-4 w-full"
                        onClick={apply}
                        disabled={submitting || !job.eligible}
                      >
                        {submitting
                          ? (<><Spinner size={18} /> Applying…</>)
                          : job.eligible
                            ? 'Apply now'
                            : closed
                              ? 'Applications closed'
                              : 'Below the minimum'}
                      </Button>
                      {!job.eligible && (
                        <p className="mt-2 text-center text-xs text-ink-400">
                          {closed
                            ? 'This employer is no longer accepting applications.'
                            : 'If your CV understates your experience, upload a fuller version and reload.'}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="mt-1 text-xs text-ink-500">
                        {job.hasResume
                          ? 'We couldn’t read your CV’s text — upload it again or paste it below.'
                          : 'Upload your CV once — we score it against every job for you.'}
                      </p>
                      <div className="mt-3 w-full rounded-lg bg-ink-50 p-3 text-left text-xs text-ink-500">
                        Apply threshold: <span className="font-semibold text-ink-900">{job.applyThreshold}%</span>
                      </div>

                      <input
                        ref={fileRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        className="hidden"
                        onChange={onFile}
                      />
                      <Button
                        variant="secondary"
                        className="mt-3 w-full"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                        ) : (
                          <><Upload className="h-4 w-4" /> Upload CV (PDF)</>
                        )}
                      </Button>
                      {uploadedName && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> {uploadedName}
                        </p>
                      )}

                      <div className="mt-3 flex items-center gap-2 text-xs text-ink-400">
                        <span className="h-px flex-1 bg-ink-100" /> or paste it <span className="h-px flex-1 bg-ink-100" />
                      </div>
                      <Textarea
                        className="mt-3"
                        rows={6}
                        value={resume}
                        onChange={(e) => setResume(e.target.value)}
                        placeholder="Paste your CV text here…"
                      />
                      <Button size="lg" className="mt-3 w-full" onClick={apply} disabled={submitting || closed}>
                        {submitting
                          ? (<><Spinner size={18} /> Scoring…</>)
                          : closed
                            ? 'Applications closed'
                            : 'Apply now'}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
