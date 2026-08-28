import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MapPin, Briefcase, Search, SlidersHorizontal, X, SearchX, Users, Wallet, Laptop, CalendarDays } from 'lucide-react'
import Button from '../../components/ui/Button'
import { Select } from '../../components/ui/Input'
import EmptyState from '../../components/ui/EmptyState'
import { CardSkeleton } from '../../components/ui/Skeleton'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import { timeAgo } from '../../lib/format'
import { cn } from '../../lib/cn'
import { formatSalary, formatDeadline, isDeadlineSoon } from '../../lib/job'

const PAGE_SIZE = 5
const jobTypes = ['All types', 'Full-time', 'Part-time', 'Contract', 'Internship']

// How well this candidate's CV matches a job, and whether it clears the
// employer's minimum. `null` means we couldn't score it (no CV, or the AI
// service is down) — better to say so than to imply a zero.
function MatchBadge({ score, eligible, threshold }) {
  if (score == null) {
    return (
      <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-500">
        Match n/a
      </span>
    )
  }
  // Eligibility decides amber vs not, but a job whose bar is 0% would otherwise
  // paint a 15% match bright green — so a weak match stays neutral.
  const tone = !eligible
    ? 'bg-amber-50 text-amber-700 ring-amber-200'
    : score >= 70
      ? 'bg-green-50 text-green-700 ring-green-200'
      : score >= 40
        ? 'bg-sky-50 text-sky-700 ring-sky-200'
        : 'bg-ink-100 text-ink-600 ring-ink-200'
  return (
    <span
      title={
        eligible
          ? `You clear this job's ${threshold}% minimum`
          : `This job needs at least ${threshold}% — you're at ${score}%`
      }
      className={cn('rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', tone)}
    >
      {score}% match
    </span>
  )
}

export default function CandidateJobs() {
  // Seeded from ?q= so the header search box can land here with a term. The
  // effect keeps it in sync when a search happens while already on this page —
  // the route params change without the component remounting.
  const [params] = useSearchParams()
  const urlQuery = params.get('q') || ''
  const [queryInput, setQueryInput] = useState(urlQuery)
  const [query, setQuery] = useState(urlQuery) // debounced
  useEffect(() => { setQueryInput(urlQuery) }, [urlQuery])
  const [type, setType] = useState('All types')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('match') // your best fits first, by default
  const [eligibleOnly, setEligibleOnly] = useState(false)

  // Debounce the search box so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(queryInput)
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [queryInput])

  const qs = useMemo(() => {
    const p = new URLSearchParams({ status: 'open', page: String(page), limit: String(PAGE_SIZE) })
    if (query.trim()) p.set('q', query.trim())
    if (type !== 'All types') p.set('type', type)
    if (sort === 'match') p.set('sort', 'match')
    if (eligibleOnly) p.set('eligible', '1') // only jobs whose bar you clear
    return p.toString()
  }, [query, type, page, sort, eligibleOnly])

  const { data, loading, error } = useFetch(() => api.get(`/jobs?${qs}`), [qs])
  const jobs = data?.jobs || []
  const pages = data?.pagination?.pages || 1
  const total = data?.pagination?.total || 0
  const activeFilters = query || type !== 'All types'

  const clearAll = () => {
    setQueryInput('')
    setQuery('')
    setType('All types')
    setPage(1)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Filter bar */}
      <div className="card-base p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
            <Search className="h-4 w-4 shrink-0 text-ink-400" />
            <input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search jobs, skills, companies…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-ink-400"
            />
            {queryInput && (
              <button onClick={() => setQueryInput('')} aria-label="Clear search">
                <X className="h-4 w-4 text-ink-400 hover:text-ink-600" />
              </button>
            )}
          </div>
          <Button variant="secondary" size="md" onClick={() => setShowFilters((s) => !s)}>
            <SlidersHorizontal className="h-4 w-4" /> Filters
          </Button>
        </div>

        {showFilters && (
          <div className="mt-3 grid gap-3 border-t border-ink-100 pt-3 sm:grid-cols-2">
            <Select label="Job type" value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}>
              {jobTypes.map((t) => <option key={t}>{t}</option>)}
            </Select>
            <Select label="Sort by" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }}>
              <option value="match">Best match for my CV</option>
              <option value="recent">Most recent</option>
            </Select>
            <label className="flex items-center gap-2 text-sm text-ink-600 sm:col-span-2">
              <input
                type="checkbox"
                checked={eligibleOnly}
                onChange={(e) => { setEligibleOnly(e.target.checked); setPage(1) }}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              Only show jobs I qualify for
              <span className="text-xs text-ink-400">(match ≥ the employer’s minimum)</span>
            </label>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">
          {loading ? 'Searching…' : <><span className="font-semibold text-ink-900">{total}</span> {total === 1 ? 'job' : 'jobs'} found</>}
        </p>
        {activeFilters && (
          <button onClick={clearAll} className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Clear filters
          </button>
        )}
      </div>

      {/* States */}
      {loading ? (
        <div className="grid gap-4">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : error ? (
        <EmptyState icon={SearchX} title="Couldn't load jobs" description={error} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No jobs match your search"
          description="Try a different keyword or clear the filters to see all open roles."
          action={activeFilters && <Button variant="secondary" onClick={clearAll}>Clear filters</Button>}
        />
      ) : (
        <div className="grid gap-4">
          {jobs.map((j) => (
            <div key={j._id} className="card-base p-5 transition hover:shadow-soft">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-ink-900">{j.title}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
                    <span>{j.company || '—'}</span>
                    <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{j.location}</span>
                    <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{j.type}</span>
                    {j.workMode && <span className="flex items-center gap-1"><Laptop className="h-3.5 w-3.5" />{j.workMode}</span>}
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{j.applicantsCount} applied</span>
                  </div>

                  {/* Pay and a closing date are the two things that decide
                      whether a candidate opens the job at all. */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {formatSalary(j) && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        <Wallet className="h-3.5 w-3.5" />{formatSalary(j)}
                      </span>
                    )}
                    {formatDeadline(j.deadline) && (
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
                        isDeadlineSoon(j.deadline) ? 'bg-amber-50 text-amber-800' : 'bg-ink-100 text-ink-600'
                      )}>
                        <CalendarDays className="h-3.5 w-3.5" />{formatDeadline(j.deadline)}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 line-clamp-2 text-sm text-ink-600">{j.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(j.skills || []).slice(0, 5).map((s) => (
                      <span key={s} className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">{s}</span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
                  <MatchBadge score={j.matchScore} eligible={j.eligible} threshold={j.applyThreshold} />
                  <span className="text-xs text-ink-400">{timeAgo(j.createdAt)}</span>
                  <Button as={Link} to={`/candidate/jobs/${j._id}`} size="sm" className="w-full sm:w-auto">
                    View &amp; apply
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && !loading && (
        <div className="flex items-center justify-center gap-1.5 pt-2">
          <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={cn('h-9 w-9 rounded-lg text-sm font-semibold transition', n === page ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-100')}
            >
              {n}
            </button>
          ))}
          <Button variant="secondary" size="sm" disabled={page === pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next</Button>
        </div>
      )}
    </div>
  )
}
