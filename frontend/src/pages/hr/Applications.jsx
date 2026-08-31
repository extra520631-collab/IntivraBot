import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, Download, CheckCircle2, UsersRound, FileText } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { Select } from '../../components/ui/Input'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import { useToast } from '../../context/ToastContext'
import { cn } from '../../lib/cn'

const statusTone = {
  applied: 'gray', screened: 'amber', shortlisted: 'green',
  interviewed: 'amber', passed: 'green', rejected: 'red',
}
const tabs = ['all', 'applied', 'screened', 'shortlisted', 'interviewed', 'passed', 'rejected']

function exportCsv(rows) {
  const headers = ['Name', 'Email', 'ATS', 'Interview', 'Emotion', 'Status', 'Flags']
  const lines = rows.map((a) =>
    [a.candidate?.name, a.candidate?.email, a.atsScore ?? '', a.interviewScore ?? '', a.emotionScore ?? '', a.status, a.flags ?? 0]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  )
  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `applicants-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export default function Applications() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const jobParam = params.get('job') || ''

  // HR's jobs for the picker
  const { data: jobsData, loading: jobsLoading } = useFetch(() => api.get('/jobs/mine'), [])
  const jobs = jobsData?.jobs || []

  // Resolve the selected job (query param, else first job)
  const selectedJob = jobParam || jobs[0]?._id || ''

  // Merge rather than replace: setParams({ job }) would wipe a ?q= the header
  // search box arrived with.
  const setJobParam = (id, opts) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('job', id)
      return next
    }, opts)
  }

  useEffect(() => {
    if (!jobParam && jobs[0]?._id) setJobParam(jobs[0]._id, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobParam, jobs])

  const { data, loading, error, reload } = useFetch(
    () => (selectedJob ? api.get(`/applications/job/${selectedJob}`) : Promise.resolve({ applications: [] })),
    [selectedJob]
  )
  const allRows = data?.applications || []

  const [tab, setTab] = useState('all')
  // Seeded from ?q= so the header search box can land here with a term. The
  // effect keeps it in sync when a search happens while already on this page —
  // the route params change without the component remounting.
  const urlQuery = params.get('q') || ''
  const [query, setQuery] = useState(urlQuery)
  useEffect(() => { setQuery(urlQuery) }, [urlQuery])
  const [sortDir, setSortDir] = useState('desc')
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)
  // Which candidate's CV is being fetched, so only that row shows a spinner.
  const [openingCv, setOpeningCv] = useState(null)

  // The CV is streamed through our API (Cloudinary blocks direct PDF delivery)
  // and the endpoint checks this HR actually received an application from them.
  const openCv = async (candidate) => {
    const tab = window.open('', '_blank') // opened up-front, or popup blockers trip
    setOpeningCv(candidate._id)
    try {
      const url = await api.blobUrl(`/uploads/resume/${candidate._id}`)
      if (tab) tab.location = url
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      tab?.close()
      toast.error(err.message || 'Could not open the CV')
    } finally {
      setOpeningCv(null)
    }
  }

  // Selections are row ids from the current job/tab's table — carrying them
  // across a job or tab switch risks a bulk action silently applying to rows
  // the HR can no longer see and no longer intends to touch.
  useEffect(() => { setSelected([]) }, [selectedJob, tab])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = allRows.filter((a) => {
      const matchesTab = tab === 'all' || a.status === tab
      const matchesQuery = !q || a.candidate?.name?.toLowerCase().includes(q) || a.candidate?.email?.toLowerCase().includes(q)
      return matchesTab && matchesQuery
    })
    if (sortDir) {
      list = [...list].sort((a, b) => (sortDir === 'asc' ? (a.atsScore ?? 0) - (b.atsScore ?? 0) : (b.atsScore ?? 0) - (a.atsScore ?? 0)))
    }
    return list
  }, [allRows, tab, query, sortDir])

  const toggleSort = () => setSortDir((d) => (d === 'desc' ? 'asc' : d === 'asc' ? null : 'desc'))
  const SortIcon = sortDir === 'asc' ? ArrowUp : sortDir === 'desc' ? ArrowDown : ArrowUpDown

  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r._id))
  const toggleAll = () => setSelected(allSelected ? [] : rows.map((r) => r._id))
  const toggleOne = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const setStatus = async (id, status) => {
    await api.patch(`/applications/${id}/status`, { status })
  }

  const bulkShortlist = async () => {
    setBusy(true)
    const ids = selected
    const results = await Promise.allSettled(ids.map((id) => setStatus(id, 'shortlisted')))
    const failedIds = ids.filter((_, i) => results[i].status === 'rejected')
    const succeededCount = ids.length - failedIds.length

    if (succeededCount > 0) {
      toast.success(`${succeededCount} candidate${succeededCount > 1 ? 's' : ''} shortlisted.`)
    }
    if (failedIds.length > 0) {
      toast.error(`${failedIds.length} could not be updated — still selected, try again.`)
    }
    // Keep only the ones that failed selected, so a retry doesn't re-touch
    // rows that already succeeded.
    setSelected(failedIds)
    reload()
    setBusy(false)
  }

  const changeStatus = async (a, status) => {
    try {
      await setStatus(a._id, status)
      toast.success(`Marked ${a.candidate?.name} as ${status}.`)
      reload()
    } catch (err) {
      toast.error(err.message || 'Could not update')
    }
  }

  const currentJob = jobs.find((j) => j._id === selectedJob)

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Applications</h2>
          <p className="text-sm text-ink-500">{currentJob ? `${currentJob.title} · ${allRows.length} candidates` : 'Select a job'}</p>
        </div>
        <Button variant="secondary" onClick={() => exportCsv(rows)} disabled={!rows.length}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Job picker */}
      {!jobsLoading && jobs.length > 0 && (
        <Select value={selectedJob} onChange={(e) => setJobParam(e.target.value)} className="max-w-md">
          {jobs.map((j) => (
            <option key={j._id} value={j._id}>{j.title} ({j.applicantsCount} applicants)</option>
          ))}
        </Select>
      )}

      {jobsLoading || loading ? (
        <div className="flex justify-center py-16 text-brand-600"><Spinner size={26} /></div>
      ) : jobs.length === 0 ? (
        <EmptyState icon={UsersRound} title="No jobs yet" description="Post a job to start receiving applicants." action={<Button as={Link} to="/hr/post-job">Post a job</Button>} />
      ) : error ? (
        <EmptyState title="Couldn't load applicants" description={error} />
      ) : (
        <>
          {/* Tabs + search */}
          <div className="card-base flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1 rounded-lg bg-ink-100 p-1">
              {tabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn('rounded-md px-3.5 py-1.5 text-sm font-semibold capitalize transition', tab === t ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500')}
                >
                  {t}
                  <span className="ml-1.5 text-xs text-ink-400">
                    {t === 'all' ? allRows.length : allRows.filter((a) => a.status === t).length}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100 sm:w-64">
              <Search className="h-4 w-4 text-ink-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search candidates…" className="w-full bg-transparent text-sm outline-none" />
            </div>
          </div>

          {/* Bulk bar */}
          {selected.length > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5">
              <p className="text-sm font-medium text-brand-800">{selected.length} selected</p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
                <Button size="sm" onClick={bulkShortlist} disabled={busy}>
                  {busy ? <Spinner size={16} /> : <CheckCircle2 className="h-4 w-4" />} Shortlist selected
                </Button>
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyState icon={UsersRound} title="No candidates found" description="No applicants match this filter yet." />
          ) : (
            <div className="card-base overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                      <th className="w-10 px-5 py-3">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500" aria-label="Select all" />
                      </th>
                      <th className="px-5 py-3 font-semibold">Candidate</th>
                      <th className="px-5 py-3 font-semibold">
                        <button onClick={toggleSort} className="inline-flex items-center gap-1 hover:text-ink-700">ATS <SortIcon className="h-3 w-3" /></button>
                      </th>
                      <th className="px-5 py-3 font-semibold">Interview</th>
                      <th className="px-5 py-3 font-semibold">Emotion</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {rows.map((a) => (
                      <tr key={a._id} className={cn('hover:bg-ink-50/50', selected.includes(a._id) && 'bg-brand-50/40')}>
                        <td className="px-5 py-3.5">
                          <input type="checkbox" checked={selected.includes(a._id)} onChange={() => toggleOne(a._id)} className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500" aria-label={`Select ${a.candidate?.name}`} />
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
                              {(a.candidate?.name || '?').split(' ').map((s) => s[0]).join('').slice(0, 2)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-ink-900">{a.candidate?.name}</span>
                                {a.flags > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" title={`${a.flags} flags`} />}
                              </div>
                              <div className="text-xs text-ink-400">{a.candidate?.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-ink-900">{a.atsScore != null ? `${a.atsScore}%` : '—'}</td>
                        <td className="px-5 py-3.5 text-ink-700">{a.interviewScore != null ? `${a.interviewScore}%` : '—'}</td>
                        <td className="px-5 py-3.5 text-ink-700">{a.emotionScore != null ? `${a.emotionScore}%` : '—'}</td>
                        <td className="px-5 py-3.5"><Badge tone={statusTone[a.status] || 'gray'}>{a.status}</Badge></td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-2">
                            <select
                              value={a.status}
                              onChange={(e) => changeStatus(a, e.target.value)}
                              className="rounded-md border border-ink-200 bg-white px-2 py-1 text-xs outline-none focus:border-brand-500"
                            >
                              {['applied', 'screened', 'shortlisted', 'interviewed', 'passed', 'rejected'].map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                            {/* Reading the CV is the first thing most
                                recruiters do; without this the only way in
                                was to open the full report. */}
                            {a.candidate?.profile?.resumeUrl && (
                              <Button
                                variant="soft"
                                size="sm"
                                title={`Open ${a.candidate?.name}'s CV`}
                                onClick={() => openCv(a.candidate)}
                                disabled={openingCv === a.candidate._id}
                              >
                                {openingCv === a.candidate._id
                                  ? <Spinner size={14} />
                                  : <FileText className="h-3.5 w-3.5" />}
                                CV
                              </Button>
                            )}
                            <Button as={Link} to={`/hr/report/${a._id}`} variant="soft" size="sm">Report</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
