import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, MailCheck, Inbox } from 'lucide-react'
import AuthShell from './AuthShell'
import { Input } from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { useToast } from '../../context/ToastContext'
import { isEmail } from '../../lib/validators'
import { api } from '../../lib/api'

export default function ForgotPassword() {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [error, setError] = useState()
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  // Returned only outside production, and only when no email actually went
  // out — lets the reset flow be tested before a mail provider is configured.
  const [devLink, setDevLink] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!email) return setError('Email is required.')
    if (!isEmail(email)) return setError('Enter a valid email address.')
    setError()
    setLoading(true)
    try {
      const res = await api.post('/auth/forgot-password', { email }, { auth: false })
      setDevLink(res.devResetUrl ? { url: res.devResetUrl, note: res.devNote } : null)
      setSent(true)
      if (!res.devResetUrl) toast.success('Reset link sent — check your inbox.')
    } catch (err) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <AuthShell>
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
            <MailCheck className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-2xl font-bold text-ink-900">Check your email</h1>
          <p className="mt-2 text-sm text-ink-500">
            We sent a password reset link to <span className="font-semibold text-ink-800">{email}</span>.
            It may take a minute to arrive.
          </p>

          {/* The first mail from a new sender often lands in spam, and people
              give up rather than look there. Say it before they do. */}
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-ink-50 p-3 text-left">
            <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
            <p className="text-xs leading-relaxed text-ink-600">
              Can&apos;t find it? Check your <span className="font-semibold text-ink-800">spam</span> or
              {' '}<span className="font-semibold text-ink-800">promotions</span> folder — the link
              expires in 30 minutes.
            </p>
          </div>

          {devLink && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left">
              <p className="text-xs font-semibold text-amber-800">Developer note</p>
              <p className="mt-1 text-xs text-amber-700">{devLink.note}</p>
              <Link
                to={devLink.url.replace(window.location.origin, '')}
                className="mt-2 block break-all text-xs font-medium text-brand-600 underline"
              >
                Open the reset link
              </Link>
            </div>
          )}

          <button
            onClick={() => setSent(false)}
            className="mt-4 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Use a different email
          </button>
          <div className="mt-6">
            <Button as={Link} to="/login" variant="secondary" className="w-full">
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Button>
          </div>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold text-ink-900">Forgot password?</h1>
      <p className="mt-1 text-sm text-ink-500">
        Enter your email and we&apos;ll send you a link to reset it.
      </p>

      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-[38px] h-4 w-4 text-ink-400" />
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (error) setError() }}
            error={error}
            className="[&_input]:pl-9"
          />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? (<><Spinner size={18} /> Sending…</>) : 'Send reset link'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        Remembered it?{' '}
        <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">Sign in</Link>
      </p>
    </AuthShell>
  )
}
