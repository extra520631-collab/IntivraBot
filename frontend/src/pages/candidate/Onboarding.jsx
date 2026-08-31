import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check, ChevronRight, ChevronLeft, Upload, Camera, Mic, FileText, X, Plus,
  GraduationCap, Briefcase, Rocket, Repeat, Sparkles, ShieldCheck, Target,
  Clock, Building2, Home, Laptop, Award, Linkedin, MapPin, Phone,
} from 'lucide-react'
import Logo from '../../components/ui/Logo'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import CameraCapture from '../../components/CameraCapture'
import VoiceEnroll from '../../components/VoiceEnroll'
import { Input, Select } from '../../components/ui/Input'
import { cn } from '../../lib/cn'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { skillDomains, skillGroups, softSkillGroup } from '../../data/mockData'

const steps = [
  { key: 'Profile', title: 'Tell us about yourself', blurb: 'The basics recruiters see first.' },
  { key: 'Skills', title: 'Your skills', blurb: 'What you can do — and how well.' },
  { key: 'Preferences', title: 'Job preferences', blurb: 'The kind of role you actually want.' },
  { key: 'Verification', title: 'Verification setup', blurb: 'Prove it is really you in interviews.' },
]

// Experience is stored as a single number for the ATS, but shown as buckets.
const experienceYearsFor = { '0-1 years': 1, '1-3 years': 2, '3-5 years': 4, '5+ years': 6 }

// People type "linkedin.com/in/me" far more often than a full URL, but the API
// wants a real one — add the scheme for them rather than rejecting it.
function normalizeUrl(value) {
  const v = value.trim()
  if (!v) return ''
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

function isValidUrl(value) {
  try {
    return Boolean(new URL(value).hostname.includes('.'))
  } catch {
    return false
  }
}

// The API returns per-field details on a 400; the bare "Validation failed"
// message on its own tells the candidate nothing.
function apiMessage(err) {
  if (err?.details?.length) {
    return err.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join(' · ')
  }
  return err?.message || 'Something went wrong'
}

function bucketFor(years) {
  if (years == null) return '0-1 years'
  if (years >= 5) return '5+ years'
  if (years >= 3) return '3-5 years'
  if (years >= 2) return '1-3 years'
  return '0-1 years'
}

// Returning candidates shouldn't have to re-pick their field — work out which
// domains their saved skills came from and open those.
function domainsFor(savedSkills) {
  if (!savedSkills?.length) return []
  const lower = savedSkills.map((s) => s.toLowerCase())
  return skillDomains
    .filter((d) =>
      d.groups.some((g) => g.skills.some((s) => lower.includes(s.toLowerCase())))
    )
    .map((d) => d.id)
}

const statusOptions = [
  { value: 'Student', desc: 'Still studying', icon: GraduationCap },
  { value: 'Fresh Graduate', desc: 'Degree done, starting out', icon: Rocket },
  { value: 'Experienced', desc: 'Already working', icon: Briefcase },
  { value: 'Career switch', desc: 'Moving to a new field', icon: Repeat },
]

const workModeOptions = [
  { value: 'Onsite', desc: 'At the office', icon: Building2 },
  { value: 'Hybrid', desc: 'Mix of both', icon: Laptop },
  { value: 'Remote', desc: 'Work from home', icon: Home },
]

/** Plain pill-style single choice, used where options need no explanation. */
function OptionGrid({ options, value, onChange, cols = 2 }) {
  return (
    <div className={cn('grid gap-2', cols === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            'rounded-lg border px-3 py-2.5 text-sm font-medium transition',
            value === o
              ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
              : 'border-ink-200 text-ink-600 hover:border-ink-300 hover:bg-ink-50'
          )}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

/** Richer single choice: icon + label + one-line description. */
function OptionCards({ options, value, onChange, cols = 2 }) {
  return (
    <div className={cn('grid gap-2.5', cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
      {options.map(({ value: v, desc, icon: Icon }) => {
        const active = value === v
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              'group flex items-start gap-3 rounded-xl border p-3.5 text-left transition',
              active
                ? 'border-brand-500 bg-brand-50/70 shadow-sm ring-1 ring-brand-200'
                : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50'
            )}
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition',
                active ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500 group-hover:bg-ink-200'
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <span className="min-w-0">
              <span className={cn('block text-sm font-semibold', active ? 'text-brand-700' : 'text-ink-900')}>
                {v}
              </span>
              <span className="mt-0.5 block text-xs text-ink-500">{desc}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Free-text list builder — used for custom ("Other") skills and certifications. */
function ChipInput({ label, hint, placeholder, values, onAdd, onRemove, maxLength = 40, icon: Icon = Plus }) {
  const [text, setText] = useState('')

  const commit = () => {
    const value = text.trim().replace(/,+$/, '')
    if (!value) return
    onAdd(value)
    setText('')
  }

  return (
    <div>
      {label && <label className="label-base">{label}</label>}
      <div className="flex gap-2">
        <input
          className="input-base"
          placeholder={placeholder}
          value={text}
          maxLength={maxLength}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              commit()
            }
          }}
        />
        <Button type="button" variant="soft" onClick={commit} disabled={!text.trim()} className="shrink-0">
          <Icon className="h-4 w-4" /> Add
        </Button>
      </div>
      {hint && <p className="mt-1.5 text-xs text-ink-400">{hint}</p>}

      {values.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700"
            >
              {v}
              <button
                type="button"
                onClick={() => onRemove(v)}
                aria-label={`Remove ${v}`}
                className="rounded-full p-0.5 text-brand-500 transition hover:bg-brand-100 hover:text-brand-800"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CandidateOnboarding() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user, setUser } = useAuth()

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const p = user?.profile

  // Step 1 — profile
  const [headline, setHeadline] = useState(p?.headline || '')
  const [location, setLocation] = useState(p?.location || '')
  const [phone, setPhone] = useState(p?.phone || '')
  const [linkedinUrl, setLinkedinUrl] = useState(p?.linkedinUrl || '')
  const [status, setStatus] = useState(p?.currentStatus || 'Fresh Graduate')
  const [experience, setExperience] = useState(bucketFor(p?.experienceYears))
  const [education, setEducation] = useState(p?.education || 'Bachelors')

  // Step 2 — skills
  const [skills, setSkills] = useState(p?.skills?.length ? p.skills : [])
  const [primarySkill, setPrimarySkill] = useState(p?.primarySkill || '')
  const [certifications, setCertifications] = useState(p?.certifications || [])
  // Which fields the candidate works in — decides which skill groups are shown.
  // Pre-select the domains their already-saved skills belong to.
  const [domains, setDomains] = useState(() => domainsFor(p?.skills))

  // Step 3 — preferences
  const [preferredRole, setPreferredRole] = useState(p?.preferredRole || '')
  const [jobType, setJobType] = useState(p?.jobType || 'Full-time')
  const [workMode, setWorkMode] = useState(p?.workMode || 'Onsite')
  const [expectedSalary, setExpectedSalary] = useState(p?.expectedSalary || '')
  const [noticePeriod, setNoticePeriod] = useState(p?.noticePeriod || 'Immediate')
  const [willingToRelocate, setWillingToRelocate] = useState(p?.willingToRelocate ?? false)
  const [language, setLanguage] = useState(user?.settings?.language || 'Both')

  // Step 4 — verification
  const [consent, setConsent] = useState(user?.settings?.faceVoiceConsent ?? true)
  const resumeRef = useRef(null)
  const photoFileRef = useRef(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingResume, setUploadingResume] = useState(false)

  const photoUrl = user?.photoUrl
  const resumeUrl = user?.profile?.resumeUrl
  const voiceEnrolled = user?.profile?.voiceEnrolled

  const experienceYears = experienceYearsFor[experience] ?? 0

  const addSkill = (s) => {
    const value = s.trim()
    if (!value) return
    setSkills((prev) =>
      prev.some((x) => x.toLowerCase() === value.toLowerCase()) ? prev : [...prev, value]
    )
    setErrors((e) => ({ ...e, skills: undefined }))
  }
  const removeSkill = (s) => {
    setSkills((prev) => prev.filter((x) => x !== s))
    setPrimarySkill((cur) => (cur === s ? '' : cur))
  }
  const toggleSkill = (s) => (skills.includes(s) ? removeSkill(s) : addSkill(s))

  const addCertification = (c) =>
    setCertifications((prev) =>
      prev.some((x) => x.toLowerCase() === c.toLowerCase()) ? prev : [...prev, c]
    )
  const removeCertification = (c) => setCertifications((prev) => prev.filter((x) => x !== c))

  // Skills the candidate typed themselves — everything not in the catalogue.
  const catalogue = skillGroups.flatMap((g) => g.skills)
  const customSkills = skills.filter((s) => !catalogue.includes(s))

  // Only the chosen fields' groups are rendered; soft skills apply to everyone.
  const chosenGroups = skillDomains
    .filter((d) => domains.includes(d.id))
    .flatMap((d) => d.groups)
  const visibleGroups = chosenGroups.length ? [...chosenGroups, softSkillGroup] : []

  // Skills already picked whose group is no longer on screen (the candidate
  // deselected that field) — keep them visible so they can still be removed.
  const shownSkills = new Set(visibleGroups.flatMap((g) => g.skills))
  const offscreenSkills = skills.filter((s) => catalogue.includes(s) && !shownSkills.has(s))

  const uploadPhoto = async (file) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return toast.error('Image is too large (max 5 MB).')
    setUploadingPhoto(true)
    try {
      const res = await api.upload('/uploads/photo', file)
      setUser((u) => ({ ...u, photoUrl: res.url }))
      setCameraOpen(false)
      toast.success('Photo saved — face verification is ready.')
    } catch (err) {
      toast.error(err.message || 'Could not upload the photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  // Streamed through our API — Cloudinary won't serve PDFs directly.
  const viewResume = async () => {
    const tab = window.open('', '_blank')
    try {
      const url = await api.blobUrl('/uploads/resume')
      if (tab) tab.location = url
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      tab?.close()
      toast.error(err.message || 'Could not open your CV')
    }
  }

  const uploadResume = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return toast.error('File is too large (max 5 MB).')
    setUploadingResume(true)
    try {
      const res = await api.upload('/uploads/resume', file)
      setUser((u) => ({ ...u, profile: { ...u.profile, resumeUrl: res.url } }))
      toast.success('CV uploaded.')
    } catch (err) {
      toast.error(err.message || 'Could not upload the CV')
    } finally {
      setUploadingResume(false)
    }
  }

  // What each step writes to the API. Saving per step means a half-finished
  // wizard is not lost if the candidate closes the tab.
  const payloadFor = (index) => {
    if (index === 0) {
      return {
        profile: {
          headline: headline.trim(),
          location: location.trim(),
          phone: phone.trim(),
          linkedinUrl: normalizeUrl(linkedinUrl),
          currentStatus: status,
          experienceYears,
          education,
        },
      }
    }
    if (index === 1) {
      return {
        profile: {
          skills,
          // Only persist a primary skill that is still in the list.
          primarySkill: skills.includes(primarySkill) ? primarySkill : '',
          certifications,
        },
      }
    }
    if (index === 2) {
      return {
        profile: {
          preferredRole: preferredRole.trim(),
          jobType,
          workMode,
          expectedSalary: expectedSalary.trim(),
          noticePeriod,
          willingToRelocate,
        },
        settings: { language },
      }
    }
    // Last step — the flag that lets RequireAuth stop funnelling them here.
    return { settings: { faceVoiceConsent: consent }, onboardingComplete: true }
  }

  const validate = (index) => {
    const next = {}
    if (index === 0) {
      if (!headline.trim()) next.headline = 'Add a short headline so recruiters know your field'
      const url = normalizeUrl(linkedinUrl)
      if (url && !isValidUrl(url)) {
        next.linkedinUrl = 'That does not look like a link — try linkedin.com/in/your-name'
      } else if (url !== linkedinUrl) {
        // Show the candidate exactly what gets saved.
        setLinkedinUrl(url)
      }
    }
    if (index === 1 && skills.length === 0) next.skills = 'Pick at least one skill — or add your own below'
    if (index === 2 && !preferredRole.trim()) next.preferredRole = 'Tell us the role you are aiming for'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const next = async () => {
    if (!validate(step)) return
    setSaving(true)
    try {
      const res = await api.patch('/auth/me', payloadFor(step))
      setUser(res.user)
      if (step < steps.length - 1) {
        setStep(step + 1)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        toast.success('Profile set up — welcome aboard!')
        navigate('/candidate')
        return
      }
    } catch (err) {
      // Map any field the API rejected back onto its input.
      if (err.details?.length) {
        setErrors(
          Object.fromEntries(
            err.details.map((d) => [d.field?.split('.').pop() || '_', d.message])
          )
        )
      }
      toast.error(apiMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const back = () => {
    if (step === 0) return
    setErrors({})
    setStep(step - 1)
  }

  const progress = Math.round(((step + 1) / steps.length) * 100)

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[340px_1fr]">
      {/* ---------- Left rail ---------- */}
      <aside className="hidden bg-gradient-to-b from-brand-600 via-brand-600 to-brand-700 p-8 text-white lg:flex lg:flex-col">
        {/* Logo redrawn for the coloured rail — the default mark uses a brand
            tile that disappears against this gradient. */}
        <div className="mb-10 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 text-white ring-1 ring-white/30">
            <span className="text-lg font-extrabold leading-none">iB</span>
          </div>
          <span className="text-lg font-extrabold tracking-tight text-white">IntivraBot</span>
        </div>

        <div className="flex-1">
          <h1 className="text-2xl font-bold leading-tight">Set up your profile</h1>
          <p className="mt-2 text-sm text-brand-100">
            Four quick steps. The more we know, the better your job matches and interview questions get.
          </p>

          <ol className="mt-8 space-y-1">
            {steps.map((s, i) => {
              const done = i < step
              const active = i === step
              return (
                <li key={s.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition',
                        done
                          ? 'bg-white text-brand-700'
                          : active
                            ? 'bg-white text-brand-700 ring-4 ring-white/25'
                            : 'bg-white/15 text-white/70'
                      )}
                    >
                      {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                    </span>
                    {i < steps.length - 1 && (
                      <span className={cn('my-1 w-0.5 flex-1', done ? 'bg-white' : 'bg-white/25')} />
                    )}
                  </div>
                  <div className={cn('pb-6 transition', active ? 'opacity-100' : 'opacity-70')}>
                    <div className="text-sm font-semibold">{s.key}</div>
                    <div className="text-xs text-brand-100">{s.blurb}</div>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        <div className="space-y-2.5 rounded-xl bg-white/10 p-4 text-xs text-brand-50">
          {[
            'AI matches you to jobs that fit your real skills',
            'Practice interviews tuned to your experience level',
            'Your data is only shared with employers you apply to',
          ].map((t) => (
            <div key={t} className="flex gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-white" />
              <span>{t}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* ---------- Form column ---------- */}
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Mobile header: logo + compact progress */}
        <div className="lg:hidden">
          <Logo className="mb-6" />
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-ink-900">{steps[step].key}</span>
            <span className="text-xs text-ink-400">Step {step + 1} of {steps.length}</span>
          </div>
          <div className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Desktop step heading */}
        <div className="mb-6 hidden lg:block">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-600">
            <Sparkles className="h-3.5 w-3.5" />
            Step {step + 1} of {steps.length}
          </div>
          <h2 className="mt-1.5 text-2xl font-bold text-ink-900">{steps[step].title}</h2>
          <p className="mt-1 text-sm text-ink-500">{steps[step].blurb}</p>
        </div>

        <div className="card-base p-6 sm:p-8">
          {/* Mobile step heading (desktop shows it above the card) */}
          <div className="mb-6 lg:hidden">
            <h2 className="text-xl font-bold text-ink-900">{steps[step].title}</h2>
            <p className="mt-1 text-sm text-ink-500">{steps[step].blurb}</p>
          </div>

          {step === 0 && (
            <div className="space-y-6">
              <Input
                label="Professional headline"
                placeholder="e.g. Frontend Developer — React & Tailwind"
                value={headline}
                maxLength={120}
                error={errors.headline}
                hint={!errors.headline ? 'One line that sums you up. Shown on your applications.' : undefined}
                onChange={(e) => setHeadline(e.target.value)}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="City"
                  placeholder="e.g. Lahore"
                  value={location}
                  maxLength={120}
                  onChange={(e) => setLocation(e.target.value)}
                />
                <Input
                  label="Phone"
                  type="tel"
                  placeholder="e.g. 0300 1234567"
                  value={phone}
                  maxLength={30}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <Input
                label="LinkedIn profile"
                type="text"
                inputMode="url"
                placeholder="linkedin.com/in/your-name"
                value={linkedinUrl}
                maxLength={200}
                error={errors.linkedinUrl}
                hint={!errors.linkedinUrl ? 'Optional — helps HR verify your background faster.' : undefined}
                onChange={(e) => setLinkedinUrl(e.target.value)}
              />

              <div className="h-px bg-ink-100" />

              <div>
                <label className="label-base">Current status</label>
                <OptionCards options={statusOptions} value={status} onChange={setStatus} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label-base">Experience</label>
                  <OptionGrid
                    options={['0-1 years', '1-3 years', '3-5 years', '5+ years']}
                    value={experience}
                    onChange={setExperience}
                  />
                </div>
                <Select
                  label="Highest education"
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                >
                  <option>Matric</option>
                  <option>Intermediate</option>
                  <option>Diploma</option>
                  <option>Bachelors</option>
                  <option>Masters</option>
                  <option>PhD</option>
                </Select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              {/* Field picker — the catalogue below follows what is chosen here. */}
              <div>
                <label className="label-base">Your field</label>
                <p className="-mt-1 mb-2.5 text-xs text-ink-400">
                  Pick one or more — you can choose more than one if you work across fields.
                </p>
                <div className="flex flex-wrap gap-2">
                  {skillDomains.map((d) => {
                    const active = domains.includes(d.id)
                    return (
                      <button
                        key={d.id}
                        type="button"
                        title={d.hint}
                        onClick={() =>
                          setDomains((prev) =>
                            prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id]
                          )
                        }
                        className={cn(
                          'rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
                          active
                            ? 'border-brand-500 bg-brand-500 text-white shadow-sm'
                            : 'border-ink-200 text-ink-600 hover:border-ink-300 hover:bg-ink-50'
                        )}
                      >
                        {active && <Check className="mr-1 inline h-3.5 w-3.5" />}
                        {d.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {visibleGroups.length === 0 && (
                <p className="rounded-xl border border-dashed border-ink-300 bg-ink-50/50 px-4 py-6 text-center text-sm text-ink-500">
                  Choose a field above to see suggested skills — or just type your own below.
                </p>
              )}

              <div className="space-y-5">
                {visibleGroups.map((group) => (
                  <div key={group.label}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                        {group.label}
                      </span>
                      <span className="h-px flex-1 bg-ink-100" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.skills.map((s) => {
                        const active = skills.includes(s)
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => toggleSkill(s)}
                            className={cn(
                              'rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
                              active
                                ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                                : 'border-ink-200 text-ink-600 hover:border-ink-300 hover:bg-ink-50'
                            )}
                          >
                            {active && <Check className="mr-1 inline h-3.5 w-3.5" />}
                            {s}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {offscreenSkills.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                      Also selected
                    </span>
                    <span className="h-px flex-1 bg-ink-100" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {offscreenSkills.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => removeSkill(s)}
                        className="rounded-full border border-brand-500 bg-brand-50 px-3.5 py-1.5 text-sm font-medium text-brand-700 shadow-sm"
                      >
                        <Check className="mr-1 inline h-3.5 w-3.5" />
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* "Other" — anything not in the catalogue */}
              <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50/50 p-4">
                <ChipInput
                  label="Other — add your own skill"
                  placeholder="Type a skill and press Enter, e.g. SAP, AutoCAD, Salesforce"
                  hint="Not in the list above? Add it here. Press Enter or comma to save each one."
                  values={customSkills}
                  onAdd={addSkill}
                  onRemove={removeSkill}
                  maxLength={40}
                />
              </div>

              {errors.skills && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{errors.skills}</p>
              )}

              <div className="h-px bg-ink-100" />

              <Select
                label="Strongest skill"
                value={skills.includes(primarySkill) ? primarySkill : ''}
                onChange={(e) => setPrimarySkill(e.target.value)}
                disabled={skills.length === 0}
              >
                <option value="">
                  {skills.length === 0 ? 'Select some skills first' : 'Choose your strongest skill'}
                </option>
                {skills.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
              <p className="-mt-4 text-xs text-ink-400">
                Interview questions lean towards this skill.
              </p>

              <ChipInput
                label="Certifications"
                placeholder="e.g. AWS Certified Cloud Practitioner"
                hint="Optional — courses, licences or certificates you have earned."
                values={certifications}
                onAdd={addCertification}
                onRemove={removeCertification}
                maxLength={80}
                icon={Award}
              />

              <div className="flex items-center justify-between rounded-lg bg-ink-50 px-3.5 py-2.5 text-xs text-ink-500">
                <span>{skills.length} skill{skills.length === 1 ? '' : 's'} selected</span>
                {certifications.length > 0 && <span>{certifications.length} certification(s)</span>}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <Input
                label="Preferred role / field"
                placeholder="e.g. Frontend Developer"
                value={preferredRole}
                maxLength={120}
                error={errors.preferredRole}
                hint={!errors.preferredRole ? 'We match open jobs against this title.' : undefined}
                onChange={(e) => setPreferredRole(e.target.value)}
              />

              <div>
                <label className="label-base">Job type</label>
                <OptionGrid
                  options={['Full-time', 'Part-time', 'Internship', 'Contract']}
                  value={jobType}
                  onChange={setJobType}
                />
              </div>

              <div>
                <label className="label-base">Work mode</label>
                <OptionCards options={workModeOptions} value={workMode} onChange={setWorkMode} cols={3} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Expected salary"
                  placeholder="e.g. 80,000 - 120,000 PKR"
                  value={expectedSalary}
                  maxLength={60}
                  hint="Optional — never shown publicly."
                  onChange={(e) => setExpectedSalary(e.target.value)}
                />
                <Select
                  label="Notice period"
                  value={noticePeriod}
                  onChange={(e) => setNoticePeriod(e.target.value)}
                >
                  <option>Immediate</option>
                  <option>15 days</option>
                  <option>1 month</option>
                  <option>2 months</option>
                  <option>3 months or more</option>
                </Select>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 p-3.5 transition hover:bg-ink-50">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-100"
                  checked={willingToRelocate}
                  onChange={(e) => setWillingToRelocate(e.target.checked)}
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                    <MapPin className="h-4 w-4 text-ink-400" /> Willing to relocate
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    Opens up jobs in other cities that would otherwise be filtered out.
                  </span>
                </span>
              </label>

              <div className="h-px bg-ink-100" />

              <div>
                <label className="label-base">Interview language</label>
                <OptionGrid options={['English', 'Urdu', 'Both']} value={language} onChange={setLanguage} cols={3} />
                <p className="mt-1.5 text-xs text-ink-400">
                  The AI interviewer asks and scores your answers in this language.
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <input
                ref={resumeRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={uploadResume}
              />
              <input
                ref={photoFileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; uploadPhoto(f) }}
              />

              {/* CV */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-ink-300 p-4">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg',
                    resumeUrl ? 'bg-green-50 text-green-600' : 'bg-brand-50 text-brand-600'
                  )}>
                    {resumeUrl ? <Check className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-ink-900">Upload your CV</div>
                    <div className="text-xs text-ink-500">
                      {resumeUrl ? 'Uploaded — used for ATS matching' : 'PDF only — AI skills extract karega'}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {resumeUrl && (
                    <button type="button" onClick={viewResume} className="text-xs font-medium text-brand-600 hover:underline">
                      <FileText className="mr-1 inline h-3.5 w-3.5" />View
                    </button>
                  )}
                  <Button variant="soft" size="sm" onClick={() => resumeRef.current?.click()} disabled={uploadingResume}>
                    {uploadingResume ? <Spinner size={16} /> : resumeUrl ? 'Replace' : 'Choose file'}
                  </Button>
                </div>
              </div>

              {/* Photo */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-ink-300 p-4">
                <div className="flex items-center gap-3">
                  {photoUrl ? (
                    <img src={photoUrl} alt="Your baseline" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <Camera className="h-5 w-5" />
                    </span>
                  )}
                  <div>
                    <div className="text-sm font-semibold text-ink-900">Capture photo</div>
                    <div className="text-xs text-ink-500">
                      {photoUrl ? 'Saved — face verification is ready' : 'Baseline for face verification'}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => photoFileRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="text-xs font-medium text-ink-500 hover:text-ink-800 disabled:opacity-50"
                  >
                    Upload file
                  </button>
                  <Button variant="soft" size="sm" onClick={() => setCameraOpen(true)} disabled={uploadingPhoto}>
                    {uploadingPhoto ? <Spinner size={16} /> : photoUrl ? 'Retake' : 'Open camera'}
                  </Button>
                </div>
              </div>

              {/* Voice — a short recording becomes the account voiceprint */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-ink-300 p-4">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg',
                    voiceEnrolled ? 'bg-green-50 text-green-600' : 'bg-brand-50 text-brand-600'
                  )}>
                    {voiceEnrolled ? <Check className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-ink-900">Voice sample</div>
                    <div className="text-xs text-ink-500">
                      {voiceEnrolled
                        ? 'Voiceprint enrolled — interviews can verify your voice'
                        : 'Read one line aloud (about 5 seconds)'}
                    </div>
                  </div>
                </div>
                <Button variant="soft" size="sm" onClick={() => setVoiceOpen(true)} className="shrink-0">
                  {voiceEnrolled ? 'Re-record' : 'Record'}
                </Button>
              </div>

              {!photoUrl && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Without a photo, face verification stays off for your interviews. You can add it later from your Profile.
                </p>
              )}

              {/* Quick recap of everything captured so far */}
              <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  <Target className="h-3.5 w-3.5" /> Your profile summary
                </div>
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {[
                    ['Headline', headline || '—', Sparkles],
                    ['Location', location || '—', MapPin],
                    ['Phone', phone || '—', Phone],
                    ['LinkedIn', linkedinUrl ? 'Added' : '—', Linkedin],
                    ['Skills', skills.length ? `${skills.length} selected` : '—', Check],
                    ['Strongest skill', primarySkill || '—', Award],
                    ['Preferred role', preferredRole || '—', Briefcase],
                    ['Work mode', `${workMode} · ${jobType}`, Laptop],
                    ['Notice period', noticePeriod, Clock],
                    ['Relocate', willingToRelocate ? 'Yes' : 'No', MapPin],
                  ].map(([label, value, Icon]) => (
                    <div key={label} className="flex items-center justify-between gap-3 border-b border-ink-100 py-1 last:border-0">
                      <dt className="flex items-center gap-1.5 text-xs text-ink-500">
                        <Icon className="h-3.5 w-3.5 text-ink-400" />
                        {label}
                      </dt>
                      <dd className="truncate text-right text-xs font-medium text-ink-900">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <label className="flex items-start gap-2 text-xs text-ink-500">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I consent to my face &amp; voice being recorded for verification during interviews.
              </label>
            </div>
          )}

          {/* Footer nav */}
          <div className="mt-8 flex items-center justify-between border-t border-ink-100 pt-6">
            <Button variant="ghost" onClick={back} disabled={step === 0 || saving}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={next} disabled={saving}>
              {saving ? (
                <><Spinner size={18} /> Saving…</>
              ) : (
                <>
                  {step === steps.length - 1 ? 'Finish & go to dashboard' : 'Save & continue'}
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-ink-400">
          Your answers save as you go — you can update anything later from your Profile.
        </p>
      </main>

      {cameraOpen && (
        <CameraCapture
          onCapture={uploadPhoto}
          onClose={() => setCameraOpen(false)}
          busy={uploadingPhoto}
        />
      )}

      {voiceOpen && (
        <VoiceEnroll
          onClose={() => setVoiceOpen(false)}
          onDone={() => {
            setVoiceOpen(false)
            setUser((u) => ({ ...u, profile: { ...u.profile, voiceEnrolled: true } }))
            toast.success('Voiceprint enrolled.')
          }}
        />
      )}
    </div>
  )
}
