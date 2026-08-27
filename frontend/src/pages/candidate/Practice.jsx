import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Play, Mic, Video, Sparkles, CheckCircle2, Info, RotateCcw, TrendingUp, Lightbulb,
} from 'lucide-react'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import { Select } from '../../components/ui/Input'
import { useToast } from '../../context/ToastContext'

// Topic names must match the server's PRACTICE_TOPICS keys — the backend picks
// the skills and question count from them.
const topics = [
  { t: 'React Fundamentals', q: 6, level: 'Beginner', desc: 'Components, hooks, state and rendering.' },
  { t: 'JavaScript Deep Dive', q: 8, level: 'Intermediate', desc: 'Closures, async, prototypes and ES6.' },
  { t: 'Behavioral / HR Round', q: 5, level: 'All levels', desc: 'Teamwork, conflict and motivation.' },
  { t: 'System Design Basics', q: 6, level: 'Advanced', desc: 'Scaling, databases, caching and APIs.' },
]

function scoreTone(score) {
  if (score >= 75) return 'green'
  if (score >= 50) return 'amber'
  return 'red'
}

export default function Practice() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  // Set when a practice run finishes and redirects back here.
  const result = location.state?.practiceResult || null

  const [language, setLanguage] = useState('English')
  const [starting, setStarting] = useState('')

  // The interview page starts the session itself — we just hand it the topic.
  const startPractice = (topic) => {
    setStarting(topic)
    try {
      navigate('/candidate/interview', { state: { practiceTopic: topic, language } })
    } catch {
      toast.error('Could not open the practice interview')
      setStarting('')
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Result of the run that just finished */}
      {result && (
        <Card>
          <CardHeader
            title="Practice complete"
            subtitle={`${result.topic || 'Practice'} · not saved to your reports`}
          />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-50">
                <span className="text-2xl font-bold text-brand-700">{result.overallScore ?? 0}%</span>
                <span className="text-[10px] font-medium uppercase text-brand-600">Score</span>
              </div>
              <div className="min-w-0 flex-1">
                <Badge tone={scoreTone(result.overallScore ?? 0)}>
                  {result.questions?.filter((q) => q.answer).length || 0} of {result.totalQuestions} answered
                </Badge>
                {result.verdict && <p className="mt-2 text-sm text-ink-600">{result.verdict}</p>}
              </div>
              <Button variant="secondary" className="shrink-0" onClick={() => startPractice(result.topic)}>
                <RotateCcw className="h-4 w-4" /> Try again
              </Button>
            </div>

            {(result.strengths?.length > 0 || result.improvements?.length > 0) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {result.strengths?.length > 0 && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      <TrendingUp className="h-3.5 w-3.5" /> Strengths
                    </div>
                    <ul className="mt-2 space-y-1 text-sm text-ink-700">
                      {result.strengths.map((s) => <li key={s}>· {s}</li>)}
                    </ul>
                  </div>
                )}
                {result.improvements?.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
                      <Lightbulb className="h-3.5 w-3.5" /> Work on
                    </div>
                    <ul className="mt-2 space-y-1 text-sm text-ink-700">
                      {result.improvements.map((s) => <li key={s}>· {s}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Per-question feedback — the real value of a practice run */}
            {result.questions?.some((q) => q.answer) && (
              <div className="divide-y divide-ink-100 rounded-xl border border-ink-200">
                {result.questions.filter((q) => q.answer).map((q) => (
                  <div key={q.order} className="p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-ink-900">Q{q.order}. {q.text}</p>
                      <Badge tone={scoreTone(q.score ?? 0)}>{q.score ?? 0}%</Badge>
                    </div>
                    {q.feedback && <p className="mt-1.5 text-xs text-ink-500">{q.feedback}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Banner */}
      <div className="overflow-hidden rounded-2xl bg-brand-600 p-6 text-white">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <h2 className="text-xl font-bold">Mock Interview</h2>
            </div>
            <p className="mt-1 max-w-lg text-brand-100">
              Practice before the real interview. You still get a score and feedback — it just never
              reaches an employer.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-32"
              aria-label="Interview language"
            >
              <option>English</option>
              <option>Urdu</option>
            </Select>
            <Button
              variant="secondary"
              onClick={() => startPractice('General Practice')}
              disabled={Boolean(starting)}
            >
              {starting === 'General Practice'
                ? <><Spinner size={16} /> Starting…</>
                : <><Play className="h-4 w-4" /> Start random</>}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        Your camera/mic stay on in practice too, so you get a feel for the real setup — but nothing is
        sent to HR and no report is saved.
      </div>

      {/* Topics */}
      <div className="grid gap-4 sm:grid-cols-2">
        {topics.map((t) => (
          <Card key={t.t}>
            <CardBody>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-ink-900">{t.t}</h3>
                <Badge tone="gray">{t.level}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-500">{t.desc}</p>
              <p className="mt-1 text-xs text-ink-400">{t.q} questions · ~10 min</p>
              <Button
                variant="soft"
                size="sm"
                className="mt-4 w-full"
                onClick={() => startPractice(t.t)}
                disabled={Boolean(starting)}
              >
                {starting === t.t
                  ? <><Spinner size={14} /> Starting…</>
                  : <><Play className="h-3.5 w-3.5" /> Practice now</>}
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Tips */}
      <Card>
        <CardHeader title="Quick tips" subtitle="For better performance" />
        <CardBody className="grid gap-2 sm:grid-cols-2">
          {[
            [Video, 'Sit in good lighting so your face is clear'],
            [Mic, 'Pick a quiet spot with a clear mic'],
            [CheckCircle2, 'Give structured answers — point by point'],
            [Sparkles, 'Stay confident, eyes on the camera'],
          ].map(([Icon, tip]) => (
            <div key={tip} className="flex items-start gap-2 text-sm text-ink-600">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> {tip}
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  )
}
