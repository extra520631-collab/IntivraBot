import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Card, CardHeader, CardBody } from './ui/Card'
import { Input, Textarea, Select } from './ui/Input'
import Button from './ui/Button'
import Spinner from './ui/Spinner'
import { useToast } from '../context/ToastContext'

/**
 * The job posting form, shared by Post Job and Edit Job so the two can't drift
 * apart — a field added here shows up in both.
 *
 * `initial` prefills it (an existing job, or the HR's hiring defaults);
 * `onSubmit` receives the assembled payload and does the create/update call.
 */
export default function JobForm({
  initial = {},
  onSubmit,
  onCancel,
  submitLabel = 'Publish job',
  savingLabel = 'Publishing…',
  showStatus = false,
}) {
  const toast = useToast()

  const [form, setForm] = useState({
    title: initial.title || '',
    location: initial.location || '',
    type: initial.type || 'Full-time',
    experience: initial.experience || '1-3 years',
    description: initial.description || '',
    status: initial.status || 'open',
  })
  const [skills, setSkills] = useState(initial.skills || [])
  const [skillInput, setSkillInput] = useState('')
  const [applyT, setApplyT] = useState(initial.applyThreshold ?? 70)
  const [passT, setPassT] = useState(initial.passThreshold ?? 80)
  const [saving, setSaving] = useState(false)

  // Questions this HR wants asked verbatim in every interview for this job.
  const [questions, setQuestions] = useState(initial.customQuestions || [])
  const [questionInput, setQuestionInput] = useState('')
  const [questionCount, setQuestionCount] = useState(initial.questionCount ?? 5)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const addSkill = () => {
    const s = skillInput.trim()
    if (s && !skills.some((x) => x.toLowerCase() === s.toLowerCase())) setSkills([...skills, s])
    setSkillInput('')
  }

  const addQuestion = () => {
    const q = questionInput.trim()
    if (q.length < 5) return toast.error('That question is too short.')
    if (questions.length >= 10) return toast.error('You can add up to 10 questions.')
    if (questions.some((x) => x.toLowerCase() === q.toLowerCase())) return
    setQuestions([...questions, q])
    setQuestionInput('')
  }

  const submit = async () => {
    if (form.title.trim().length < 3) return toast.error('Please enter a job title.')
    if (form.description.trim().length < 10) return toast.error('Please write a longer description.')
    if (skills.length === 0) return toast.error('Add at least one required skill.')
    if (passT < applyT) return toast.error('Pass threshold must be ≥ apply threshold.')

    setSaving(true)
    try {
      await onSubmit({
        title: form.title.trim(),
        location: form.location.trim() || 'Remote',
        type: form.type,
        experience: form.experience,
        description: form.description.trim(),
        skills,
        applyThreshold: applyT,
        passThreshold: passT,
        customQuestions: questions,
        // Always leave room for the warm-up plus every HR question.
        questionCount: Math.max(questionCount, questions.length + 1),
        ...(showStatus ? { status: form.status } : {}),
      })
    } catch {
      // onSubmit surfaces its own error; just re-enable the button.
      setSaving(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader title="Job details" />
        <CardBody className="space-y-4">
          <Input label="Job title" placeholder="e.g. Frontend Developer (React)" value={form.title} onChange={set('title')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Location" placeholder="e.g. Lahore / Remote" value={form.location} onChange={set('location')} />
            <Select label="Job type" value={form.type} onChange={set('type')}>
              <option>Full-time</option>
              <option>Part-time</option>
              <option>Contract</option>
              <option>Internship</option>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Experience level" value={form.experience} onChange={set('experience')}>
              <option>0-1 years</option>
              <option>1-3 years</option>
              <option>3-5 years</option>
              <option>5+ years</option>
            </Select>
            {showStatus && (
              <Select label="Status" value={form.status} onChange={set('status')}>
                <option value="open">Open — accepting applications</option>
                <option value="closed">Closed — no new applications</option>
                <option value="draft">Draft — hidden from candidates</option>
              </Select>
            )}
          </div>
          <Textarea label="Description" placeholder="Write about the role…" rows={4} value={form.description} onChange={set('description')} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Required skills" subtitle="AI matches candidate CVs against these" />
        <CardBody>
          <div className="flex gap-2">
            <input
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
              placeholder="Type a skill and press Enter"
              className="input-base"
            />
            <Button variant="secondary" onClick={addSkill}><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                {s}
                <button onClick={() => setSkills(skills.filter((x) => x !== s))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Interview questions"
          subtitle="AI writes the rest — add any you want asked word for word"
        />
        <CardBody className="space-y-4">
          <div className="flex gap-2">
            <input
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addQuestion())}
              placeholder="e.g. Why do you want to work at our company?"
              maxLength={300}
              className="input-base"
            />
            <Button variant="secondary" onClick={addQuestion}><Plus className="h-4 w-4" /></Button>
          </div>

          {questions.length > 0 && (
            <ol className="space-y-2">
              {questions.map((q, i) => (
                <li key={q} className="flex items-start gap-2 rounded-lg border border-ink-200 bg-ink-50/50 p-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                    {i + 1}
                  </span>
                  <p className="flex-1 text-sm text-ink-700">{q}</p>
                  <button
                    onClick={() => setQuestions(questions.filter((x) => x !== q))}
                    aria-label="Remove question"
                    className="text-ink-400 transition hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ol>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="label-base mb-0">Total questions</label>
                <span className="text-sm font-bold text-brand-600">
                  {Math.max(questionCount, questions.length + 1)}
                </span>
              </div>
              <input
                type="range"
                min="3"
                max="15"
                value={questionCount}
                onChange={(e) => setQuestionCount(+e.target.value)}
                className="w-full accent-brand-600"
              />
            </div>
            <p className="self-end text-xs text-ink-400">
              {questions.length === 0
                ? 'All questions will be AI-generated for this role and candidate.'
                : `Question 1 is a warm-up, then your ${questions.length} question${questions.length === 1 ? '' : 's'}, then AI fills the rest.`}
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Thresholds" subtitle="Two gates: one to apply, one to pass" />
        <CardBody className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="label-base mb-0">Apply threshold</label>
                <span className="text-sm font-bold text-brand-600">{applyT}%</span>
              </div>
              <input type="range" min="0" max="100" value={applyT} onChange={(e) => setApplyT(+e.target.value)} className="w-full accent-brand-600" />
              <p className="mt-1 text-xs text-ink-400">Candidates below this match can&apos;t apply.</p>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="label-base mb-0">Pass threshold</label>
                <span className="text-sm font-bold text-brand-600">{passT}%</span>
              </div>
              <input type="range" min="0" max="100" value={passT} onChange={(e) => setPassT(+e.target.value)} className="w-full accent-brand-600" />
              <p className="mt-1 text-xs text-ink-400">Candidates above this are auto-shortlisted.</p>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? (<><Spinner size={18} /> {savingLabel}</>) : submitLabel}
        </Button>
      </div>
    </>
  )
}
