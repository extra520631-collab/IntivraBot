import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Bot, ShieldCheck, FileScan, Mic, ScanFace,
  BarChart3, Languages, CheckCircle2, Mail, MapPin, Clock, Send,
} from 'lucide-react'
import PublicNavbar from '../components/layout/PublicNavbar'
import Button from '../components/ui/Button'
import Logo from '../components/ui/Logo'
import Reveal from '../components/ui/Reveal'
import Spinner from '../components/ui/Spinner'
import { Input, Textarea } from '../components/ui/Input'
import { useToast } from '../context/ToastContext'
import { isEmail } from '../lib/validators'

const features = [
  { icon: FileScan, title: 'ATS Resume Scanning', desc: 'Resumes are parsed, skills & experience extracted, then matched to the job.' },
  { icon: Bot, title: 'AI Interviews', desc: 'Gemini-powered adaptive questions - text or voice, in real time.' },
  { icon: ScanFace, title: 'Face Verification', desc: 'Matched against the registration photo - the real candidate, no proxies.' },
  { icon: Mic, title: 'Voice Biometrics', desc: 'A voice fingerprint confirms the speaker and detects multiple voices.' },
  { icon: BarChart3, title: 'Emotion Analysis', desc: 'Confidence, stress and engagement measured on every question.' },
  { icon: Languages, title: 'Multi-language', desc: 'English and Urdu - candidates interview in their preferred language.' },
]

const steps = [
  { n: '01', t: 'Apply', d: 'Candidate uploads a CV and gets an ATS match score.' },
  { n: '02', t: 'Verify', d: 'Face + voice check confirms the real candidate.' },
  { n: '03', t: 'Interview', d: 'AI asks adaptive questions, emotion monitored live.' },
  { n: '04', t: 'Report', d: 'Scores, strengths and shortlist - sent to both sides.' },
]

const faqs = [
  ['Can candidates answer in text?', 'Voice is the default, but with a valid reason (mic, internet, or accessibility) a candidate can switch to text. Face verification keeps running throughout.'],
  ['Is my data secure?', 'Yes. Passwords are encrypted, files are in secure storage, and face/voice are used only for verification - with your consent.'],
  ['Is it free?', 'During beta, IntivraBot is free for both candidates and recruiters.'],
  ['Which languages are supported?', 'English and Urdu - candidates can interview in the language they prefer.'],
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <PublicNavbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-brand-50/70 to-transparent" />
        {/* Floating decorative accents */}
        <div className="animate-float pointer-events-none absolute -left-10 top-24 -z-10 h-40 w-40 rounded-full bg-brand-100/60 blur-2xl" />
        <div className="animate-float pointer-events-none absolute right-0 top-10 -z-10 h-52 w-52 rounded-full bg-brand-200/40 blur-3xl" style={{ animationDelay: '1.5s' }} />

        <div className="mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <span className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <ShieldCheck className="h-3.5 w-3.5" /> AI-powered · Unbiased · Secure
            </span>
            <h1 className="animate-fade-up mt-4 text-4xl font-extrabold leading-tight tracking-tight text-ink-900 sm:text-5xl" style={{ animationDelay: '80ms' }}>
              Hire smarter with{' '}
              <span className="text-brand-600">AI-driven interviews</span>
            </h1>
            <p className="animate-fade-up mx-auto mt-4 max-w-2xl text-lg text-ink-500" style={{ animationDelay: '160ms' }}>
              IntivraBot automates the first round of recruitment - resume screening,
              AI interviews, face &amp; voice verification, and detailed reports. Save HR
              time and remove bias.
            </p>
            <div className="animate-fade-up mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ animationDelay: '240ms' }}>
              <Button as={Link} to="/register" size="lg" className="w-full sm:w-auto">
                Start free <ArrowRight className="h-4 w-4" />
              </Button>
              <Button as={Link} to="/login" size="lg" variant="secondary" className="w-full sm:w-auto">
                I already have an account
              </Button>
            </div>
            <p className="animate-fade-up mt-3 text-xs text-ink-400" style={{ animationDelay: '320ms' }}>No credit card required · Free during beta</p>
          </div>

          {/* Hero accent panel (orange band, white text) */}
          <div className="animate-pop mx-auto mt-8 max-w-4xl overflow-hidden rounded-2xl bg-brand-600 shadow-soft" style={{ animationDelay: '380ms' }}>
            <div className="grid gap-px bg-brand-500 sm:grid-cols-3">
              {[
                ['80%', 'Less screening time'],
                ['3-in-1', 'Resume + Interview + Emotion'],
                ['0 bias', 'Objective scoring'],
              ].map(([big, small]) => (
                <div key={small} className="bg-brand-600 p-5 text-center text-white transition hover:bg-brand-700">
                  <div className="text-3xl font-extrabold">{big}</div>
                  <div className="mt-1 text-sm text-brand-100">{small}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <Reveal className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-ink-900">One platform, the whole pipeline</h2>
          <p className="mt-2 text-ink-500">Other tools cover a single stage - IntivraBot covers the entire journey.</p>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 80} className="card-base hover-lift p-6 hover:shadow-soft">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-ink-900">{f.title}</h3>
              <p className="mt-1.5 text-sm text-ink-500">{f.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-ink-100 bg-ink-50/50">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <Reveal className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-ink-900">How it works</h2>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 90} className="card-base hover-lift p-6 hover:shadow-soft">
                <div className="text-2xl font-extrabold text-brand-600">{s.n}</div>
                <h3 className="mt-2 text-base font-semibold text-ink-900">{s.t}</h3>
                <p className="mt-1 text-sm text-ink-500">{s.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Reveal as="div" className="card-base p-8">
            <h3 className="text-xl font-bold text-ink-900">For Candidates</h3>
            <ul className="mt-4 space-y-2.5">
              {['Upload your CV and let AI extract your skills', 'Take an AI interview once you match', 'Get an instant score and feedback report'].map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-ink-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> {t}
                </li>
              ))}
            </ul>
            <Button as={Link} to="/register" className="mt-6">Apply as Candidate</Button>
          </Reveal>
          <Reveal as="div" delay={120} className="card-base p-8">
            <h3 className="text-xl font-bold text-ink-900">For HR Managers</h3>
            <ul className="mt-4 space-y-2.5">
              {['Post a job and set your thresholds', 'Review ranked reports with fraud flags', 'Finalize your shortlist in one click'].map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-ink-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> {t}
                </li>
              ))}
            </ul>
            <Button as={Link} to="/register" variant="secondary" className="mt-6">Hire with IntivraBot</Button>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-ink-100 bg-ink-50/50">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <Reveal className="mb-6 text-center">
            <h2 className="text-3xl font-bold text-ink-900">Frequently asked</h2>
          </Reveal>
          <div className="space-y-3">
            {faqs.map(([q, a], i) => (
              <Reveal as="details" delay={i * 70} key={q} className="group card-base p-5 [&_summary]:cursor-pointer">
                <summary className="flex list-none items-center justify-between text-sm font-semibold text-ink-900">
                  {q}
                  <span className="ml-4 text-brand-600 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-ink-500">{a}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <ContactSection />

      {/* CTA band */}
      <section className="bg-brand-600">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 text-center sm:flex-row sm:px-6 sm:text-left">
          <div className="text-white">
            <h3 className="text-2xl font-bold">Ready to hire smarter?</h3>
            <p className="mt-1 text-brand-100">Create your free account today.</p>
          </div>
          <Button as={Link} to="/register" variant="secondary" size="lg" className="shrink-0">
            Get started free <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="grid gap-8 md:grid-cols-5">
            <div className="md:col-span-2">
              <Logo />
              <p className="mt-3 max-w-xs text-sm text-ink-500">
                AI-powered recruitment platform - resume screening, intelligent interviews,
                and identity verification in one place.
              </p>
            </div>
            {[
              ['Product', [['Features', '#features'], ['How it works', '#how'], ['For candidates', '#roles'], ['For recruiters', '#roles']]],
              ['Company', [['About', '#'], ['Careers', '#'], ['Contact', '#contact'], ['Blog', '/blog']]],
              ['Legal', [['Privacy', '#'], ['Terms', '#'], ['Security', '#'], ['Consent', '#']]],
            ].map(([title, items]) => (
              <div key={title}>
                <h4 className="text-sm font-semibold text-ink-900">{title}</h4>
                <ul className="mt-3 space-y-2">
                  {items.map(([label, href]) => (
                    <li key={label}>
                      {href.startsWith('/') ? (
                        <Link to={href} className="text-sm text-ink-500 hover:text-brand-600">{label}</Link>
                      ) : (
                        <a href={href} className="text-sm text-ink-500 hover:text-brand-600">{label}</a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-ink-100 pt-6 sm:flex-row">
            <p className="text-sm text-ink-400">© 2026 IntivraBot · Final Year Project</p>
            <p className="text-sm text-ink-400">Made with care in Pakistan 🇵🇰</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

const contactInfo = [
  { icon: Mail, label: 'Email us', value: 'hello@intivrabot.app' },
  { icon: MapPin, label: 'Based in', value: 'Lahore, Pakistan' },
  { icon: Clock, label: 'Response time', value: 'Within 24 hours' },
]

function ContactSection() {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }))
  }

  const submit = (e) => {
    e.preventDefault()
    const errs = {}
    if (!form.name.trim()) errs.name = 'Please enter your name.'
    if (!form.email) errs.email = 'Email is required.'
    else if (!isEmail(form.email)) errs.email = 'Enter a valid email address.'
    if (!form.message.trim()) errs.message = 'Please write a short message.'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setForm({ name: '', email: '', message: '' })
      toast.success('Thanks! We’ll get back to you within 24 hours.')
    }, 800)
  }

  return (
    <section id="contact" className="border-t border-ink-100 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <Reveal className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-ink-900">Get in touch</h2>
          <p className="mt-2 text-ink-500">Questions, feedback, or a demo request - we’d love to hear from you.</p>
        </Reveal>

        <div className="grid gap-8 lg:grid-cols-5">
          {/* Info side */}
          <Reveal className="space-y-4 lg:col-span-2">
            {contactInfo.map((c) => (
              <div key={c.label} className="card-base flex items-center gap-4 p-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <c.icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-sm text-ink-500">{c.label}</div>
                  <div className="font-semibold text-ink-900">{c.value}</div>
                </div>
              </div>
            ))}
            <div className="rounded-xl bg-brand-600 p-5 text-white">
              <p className="text-sm font-semibold">Prefer to jump right in?</p>
              <p className="mt-1 text-sm text-brand-100">Create a free account and explore the full platform.</p>
              <Button as={Link} to="/register" variant="secondary" size="sm" className="mt-3">
                Start free <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </Reveal>

          {/* Form side */}
          <Reveal delay={120} className="lg:col-span-3">
            <form onSubmit={submit} noValidate className="card-base space-y-4 p-6 sm:p-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Your name" placeholder="e.g. Ali Raza" value={form.name} onChange={set('name')} error={errors.name} />
                <Input label="Email" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} error={errors.email} />
              </div>
              <Textarea label="Message" rows={5} placeholder="How can we help?" value={form.message} onChange={set('message')} />
              {errors.message && <p className="-mt-2 text-xs text-red-600">{errors.message}</p>}
              <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={loading}>
                {loading ? (<><Spinner size={18} /> Sending…</>) : (<>Send message <Send className="h-4 w-4" /></>)}
              </Button>
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
