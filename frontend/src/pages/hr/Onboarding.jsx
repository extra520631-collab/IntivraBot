import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check, ChevronRight, ChevronLeft, X, Plus, Camera, Sparkles, ShieldCheck,
  Building2, Users, Briefcase, Code2, Megaphone, Landmark, GraduationCap,
  Stethoscope, Factory, ShoppingBag, UserCog, Crown, UsersRound, Search,
  Target, SlidersHorizontal, Languages, ListChecks, Gauge, Rocket, Timer,
} from 'lucide-react'
import Logo from '../../components/ui/Logo'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import CameraCapture from '../../components/CameraCapture'
import { Input, Select } from '../../components/ui/Input'
import { cn } from '../../lib/cn'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

const steps = [
  { key: 'Company', title: 'About your company', blurb: 'What candidates see on your job posts.' },
  { key: 'Your role', title: 'Your role in hiring', blurb: 'Who you are on the hiring side.' },
  { key: 'Screening', title: 'Screening defaults', blurb: 'How strictly AI filters applicants.' },
  { key: 'Interviews', title: 'Interview defaults', blurb: 'How the AI interviewer runs your rounds.' },
]

// The API returns per-field details on a 400; the bare "Validation failed"
// message on its own tells the recruiter nothing.
function apiMessage(err) {
  if (err?.details?.length) {
    return err.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join(' · ')
  }
  return err?.message || 'Something went wrong'
}

const industryOptions = [
  { value: 'IT / Software', desc: 'Engineering, product, data', icon: Code2 },
  { value: 'Marketing', desc: 'Growth, content, design', icon: Megaphone },
  { value: 'Finance', desc: 'Banking, fintech, accounts', icon: Landmark },
  { value: 'Education', desc: 'Schools, edtech, training', icon: GraduationCap },
  { value: 'Healthcare', desc: 'Clinics, pharma, medtech', icon: Stethoscope },
  { value: 'Manufacturing', desc: 'Production, supply chain', icon: Factory },
  { value: 'Retail / E-commerce', desc: 'Stores, marketplaces', icon: ShoppingBag },
  { value: 'Other', desc: 'Something else entirely', icon: Building2 },
]

const sizeOptions = [
  { value: '1-10', desc: 'Early-stage team', icon: Rocket },
  { value: '11-50', desc: 'Growing company', icon: Users },
  { value: '51-200', desc: 'Established mid-size', icon: Building2 },
  { value: '200+', desc: 'Large organisation', icon: Factory },
]

const designationOptions = [
  { value: 'Recruiter', desc: 'Sourcing and screening', icon: Search },
  { value: 'HR Manager', desc: 'Owns the hiring process', icon: UserCog },
  { value: 'Team Lead', desc: 'Hires for your own team', icon: UsersRound },
  { value: 'Founder', desc: 'Hiring alongside everything else', icon: Crown },
]

// Common departments — one tap instead of typing. Stored as a comma string
// because that is what the `hiring.departments` field expects.
const departmentSuggestions = [
  'Engineering', 'Design', 'Product', 'Data & AI', 'QA', 'DevOps',
  'Sales', 'Marketing', 'Customer Support', 'Finance', 'Operations', 'HR',
]

// Named presets over the two thresholds — recruiters think in "how strict",
// not in percentages. The numbers stay editable underneath.
const strictnessPresets = [
  { value: 'Open', apply: 50, pass: 65, desc: 'Wide net, more interviews', icon: Users },
  { value: 'Balanced', apply: 70, pass: 80, desc: 'Recommended for most roles', icon: Gauge },
  { value: 'Strict', apply: 85, pass: 90, desc: 'Only very close matches', icon: Target },
]

/** Plain pill-style single choice, used where options need no explanation. */
function OptionGrid({ options, value, onChange, cols = 2 }) {
  return (
    <div className={cn('grid gap-2', cols === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
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
    <div className={cn('grid gap-2.5', cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
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

/** Free-text list builder — used for departments outside the suggestions. */
function ChipInput({ label, hint, placeholder, values, onAdd, onRemove, maxLength = 40 }) {
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
          <Plus className="h-4 w-4" /> Add
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

/** Slider + live read-out, used for the two match thresholds. */
function ThresholdSlider({ label, hint, value, onChange, min = 0, max = 100 }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label-base">{label}</label>
        <span className="text-sm font-bold text-brand-700">{value}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-ink-100 accent-brand-600"
      />
      {hint && <p className="mt-1.5 text-xs text-ink-400">{hint}</p>}
    </div>
  )
}

export default function HrOnboarding() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user, setUser } = useAuth()

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const h = user?.hiring

  // Step 1 — company
  const [company, setCompany] = useState(user?.company || '')
  const [industry, setIndustry] = useState(h?.industry || 'IT / Software')
  const [size, setSize] = useState(h?.size || '11-50')

  // Step 2 — role. Departments live in the API as one comma-separated string;
  // the wizard edits them as chips and joins on save.
  const [designation, setDesignation] = useState(h?.designation || 'HR Manager')
  const [departments, setDepartments] = useState(() =>
    (h?.departments || '').split(',').map((d) => d.trim()).filter(Boolean)
  )

  // Step 3 — screening
  const [applyThreshold, setApplyThreshold] = useState(h?.applyThreshold ?? 70)
  const [passThreshold, setPassThreshold] = useState(h?.passThreshold ?? 80)

  // Step 4 — interviews
  const [language, setLanguage] = useState(h?.language || 'English')
  const [questionsPerInterview, setQuestionsPerInterview] = useState(h?.questionsPerInterview ?? 5)

  // Optional company/recruiter photo — reuses the shared photo upload.
  const photoFileRef = useRef(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoUrl = user?.photoUrl

  const addDepartment = (d) => {
    const value = d.trim()
    if (!value) return
    setDepartments((prev) =>
      prev.some((x) => x.toLowerCase() === value.toLowerCase()) ? prev : [...prev, value]
    )
  }
  const removeDepartment = (d) => setDepartments((prev) => prev.filter((x) => x !== d))
  const toggleDepartment = (d) => (departments.includes(d) ? removeDepartment(d) : addDepartment(d))

  // Departments typed by hand — everything not in the suggestion list.
  const customDepartments = departments.filter((d) => !departmentSuggestions.includes(d))

  // Which preset the current pair of thresholds matches, if any.
  const activePreset = strictnessPresets.find(
    (p) => p.apply === Number(applyThreshold) && p.pass === Number(passThreshold)
  )?.value

  const applyPreset = (name) => {
    const preset = strictnessPresets.find((p) => p.value === name)
    if (!preset) return
    setApplyThreshold(preset.apply)
    setPassThreshold(preset.pass)
    setErrors((e) => ({ ...e, passThreshold: undefined }))
  }

  const uploadPhoto = async (file) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return toast.error('Image is too large (max 5 MB).')
    setUploadingPhoto(true)
    try {
      const res = await api.upload('/uploads/photo', file)
      setUser((u) => ({ ...u, photoUrl: res.url }))
      setCameraOpen(false)
      toast.success('Photo saved.')
    } catch (err) {
      toast.error(err.message || 'Could not upload the photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  // What each step writes to the API. Saving per step means a half-finished
  // wizard is not lost if the recruiter closes the tab.
  const payloadFor = (index) => {
    if (index === 0) {
      return { company: company.trim(), hiring: { industry, size } }
    }
    if (index === 1) {
      return { hiring: { designation, departments: departments.join(', ') } }
    }
    if (index === 2) {
      return {
        hiring: { applyThreshold: Number(applyThreshold), passThreshold: Number(passThreshold) },
      }
    }
    // Last step — the flag that lets RequireAuth stop funnelling them here.
    return {
      hiring: { language, questionsPerInterview: Number(questionsPerInterview) },
      onboardingComplete: true,
    }
  }

  const validate = (index) => {
    const next = {}
    if (index === 0 && company.trim().length < 2) {
      next.company = 'Enter your company name — job posts and invites are grouped under it'
    }
    if (index === 2 && Number(passThreshold) < Number(applyThreshold)) {
      next.passThreshold = 'The pass threshold cannot be lower than the apply threshold'
    }
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
        toast.success('Company profile saved — welcome aboard!')
        navigate('/hr')
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
          <h1 className="text-2xl font-bold leading-tight">Set up your hiring workspace</h1>
          <p className="mt-2 text-sm text-brand-100">
            Four quick steps. These become the defaults on every job you post — change any of them per job later.
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
            'AI screens every CV against your job before you see it',
            'Interviews run themselves and come back scored',
            'Your team shares one company workspace and pipeline',
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
                label="Company name"
                placeholder="e.g. TechNova"
                value={company}
                maxLength={120}
                error={errors.company}
                hint={!errors.company ? 'Your team, invites and job posts are grouped under this name.' : undefined}
                onChange={(e) => setCompany(e.target.value)}
              />

              <div className="h-px bg-ink-100" />

              <div>
                <label className="label-base">Industry</label>
                <p className="-mt-1 mb-2.5 text-xs text-ink-400">
                  Helps the AI phrase interview questions in your sector's language.
                </p>
                <OptionCards options={industryOptions} value={industry} onChange={setIndustry} />
              </div>

              <div>
                <label className="label-base">Company size</label>
                <OptionCards options={sizeOptions} value={size} onChange={setSize} />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <input
                ref={photoFileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; uploadPhoto(f) }}
              />

              <div>
                <label className="label-base">Your designation</label>
                <OptionCards options={designationOptions} value={designation} onChange={setDesignation} />
              </div>

              <div className="h-px bg-ink-100" />

              <div>
                <label className="label-base">Departments you hire for</label>
                <p className="-mt-1 mb-2.5 text-xs text-ink-400">
                  Pick as many as apply — these pre-fill the department field when you post a job.
                </p>
                <div className="flex flex-wrap gap-2">
                  {departmentSuggestions.map((d) => {
                    const active = departments.includes(d)
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDepartment(d)}
                        className={cn(
                          'rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
                          active
                            ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                            : 'border-ink-200 text-ink-600 hover:border-ink-300 hover:bg-ink-50'
                        )}
                      >
                        {active && <Check className="mr-1 inline h-3.5 w-3.5" />}
                        {d}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* "Other" — anything outside the suggestion list */}
              <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50/50 p-4">
                <ChipInput
                  label="Other — add your own department"
                  placeholder="Type a department and press Enter, e.g. Legal, Logistics"
                  hint="Not in the list above? Add it here. Press Enter or comma to save each one."
                  values={customDepartments}
                  onAdd={addDepartment}
                  onRemove={removeDepartment}
                  maxLength={40}
                />
              </div>

              <div className="h-px bg-ink-100" />

              {/* Optional profile photo — candidates see it on interview invites */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-ink-300 p-4">
                <div className="flex items-center gap-3">
                  {photoUrl ? (
                    <img src={photoUrl} alt="Your profile" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <Camera className="h-5 w-5" />
                    </span>
                  )}
                  <div>
                    <div className="text-sm font-semibold text-ink-900">Profile photo</div>
                    <div className="text-xs text-ink-500">
                      {photoUrl ? 'Saved — shown to your team and candidates' : 'Optional — puts a face on your invites'}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
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
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label className="label-base">How strict should screening be?</label>
                <p className="-mt-1 mb-2.5 text-xs text-ink-400">
                  Start from a preset — you can fine-tune the exact numbers below.
                </p>
                <OptionCards
                  options={strictnessPresets}
                  value={activePreset}
                  onChange={applyPreset}
                  cols={3}
                />
              </div>

              <div className="h-px bg-ink-100" />

              <ThresholdSlider
                label="Apply threshold"
                value={Number(applyThreshold)}
                onChange={setApplyThreshold}
                hint="Candidates below this CV match score cannot apply to your jobs at all."
              />

              <ThresholdSlider
                label="Pass threshold"
                value={Number(passThreshold)}
                onChange={(v) => {
                  setPassThreshold(v)
                  setErrors((e) => ({ ...e, passThreshold: undefined }))
                }}
                hint="Interview score a candidate needs to be marked as passed."
              />

              {errors.passThreshold && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{errors.passThreshold}</p>
              )}

              <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  <SlidersHorizontal className="h-3.5 w-3.5" /> What this means
                </div>
                <p className="text-xs leading-relaxed text-ink-600">
                  A CV scoring under <span className="font-semibold text-ink-900">{applyThreshold}%</span> against
                  your job never reaches your inbox. Anyone who interviews needs
                  <span className="font-semibold text-ink-900"> {passThreshold}%</span> or more to land in the
                  passed pile. Both are only defaults — every job can override them.
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <label className="label-base">Default interview language</label>
                <OptionGrid options={['English', 'Urdu', 'Both']} value={language} onChange={setLanguage} cols={3} />
                <p className="mt-1.5 text-xs text-ink-400">
                  The AI interviewer asks and scores answers in this language.
                </p>
              </div>

              <div>
                <label className="label-base">Questions per interview</label>
                <OptionGrid
                  options={['5', '8', '10']}
                  value={String(questionsPerInterview)}
                  onChange={(v) => setQuestionsPerInterview(Number(v))}
                  cols={3}
                />
                <p className="mt-1.5 text-xs text-ink-400">
                  Roughly {Number(questionsPerInterview) * 3}–{Number(questionsPerInterview) * 4} minutes per candidate.
                </p>
              </div>

              <div className="h-px bg-ink-100" />

              {/* Quick recap of everything captured so far */}
              <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  <Target className="h-3.5 w-3.5" /> Your hiring defaults
                </div>
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {[
                    ['Company', company || '—', Building2],
                    ['Industry', industry, Briefcase],
                    ['Company size', `${size} people`, Users],
                    ['Your role', designation, UserCog],
                    ['Departments', departments.length ? `${departments.length} selected` : '—', ListChecks],
                    ['Apply threshold', `${applyThreshold}%`, Gauge],
                    ['Pass threshold', `${passThreshold}%`, Target],
                    ['Interview language', language, Languages],
                    ['Questions', `${questionsPerInterview} per interview`, ListChecks],
                    ['Est. length', `~${Number(questionsPerInterview) * 3} min`, Timer],
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
          Your answers save as you go — you can update anything later from Settings.
        </p>
      </main>

      {cameraOpen && (
        <CameraCapture
          onCapture={uploadPhoto}
          onClose={() => setCameraOpen(false)}
          busy={uploadingPhoto}
        />
      )}
    </div>
  )
}
