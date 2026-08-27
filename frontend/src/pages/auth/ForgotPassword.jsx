import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, MailCheck } from 'lucide-react'
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

  const submit = async (e) => {
    e.preventDefault()
    if (!email) return setError('Email is required.')
    if (!isEmail(email)) return setError('Enter a valid email address.')
    setError()
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email }, { auth: false })
      setSent(true)
      toast.success('Reset link sent — check your inbox.')
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
