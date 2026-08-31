import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Lock, ArrowLeft, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react'
import AuthShell from './AuthShell'
import { Input } from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { useToast } from '../../context/ToastContext'
import { api } from '../../lib/api'

// Where the emailed link lands. The token rides in the query string; this page
// collects a new password and posts both to /auth/reset-password.
export default function ResetPassword() {
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  // A link opened without a token can never work - say so rather than showing
  // a form that is guaranteed to fail on submit.
  if (!token) {
    return (
      <AuthShell>
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertCircle className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-2xl font-bold text-ink-900">Link is not valid</h1>
          <p className="mt-2 text-sm text-ink-500">
            This reset link is missing its token. Request a new one and use the most recent email.
          </p>
          <div className="mt-6 space-y-2">
            <Button as={Link} to="/forgot-password" className="w-full">Request a new link</Button>
            <Button as={Link} to="/login" variant="secondary" className="w-full">
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Button>
          </div>
        </div>
      </AuthShell>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')
    setError()
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password }, { auth: false })
      setDone(true)
      toast.success('Password updated - you can sign in now.')
      setTimeout(() => navigate('/login'), 2500)
    } catch (err) {
      // An expired or already-used token is the common case; make that clear
      // instead of showing a generic failure.
      setError(
        err.status === 400
          ? 'This link has expired or was already used. Request a new one.'
          : err.message || 'Could not reset your password.'
      )
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <AuthShell>
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-2xl font-bold text-ink-900">Password updated</h1>
          <p className="mt-2 text-sm text-ink-500">
            Taking you to the sign-in page...
          </p>
          <div className="mt-6">
            <Button as={Link} to="/login" className="w-full">Sign in now</Button>
          </div>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold text-ink-900">Choose a new password</h1>
      <p className="mt-1 text-sm text-ink-500">
        Pick something you have not used before. At least 8 characters.
      </p>

      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-[38px] h-4 w-4 text-ink-400" />
          <Input
            label="New password"
            type={show ? 'text' : 'password'}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (error) setError() }}
            className="[&_input]:pl-9 [&_input]:pr-10"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-[38px] text-ink-400 hover:text-ink-600"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-[38px] h-4 w-4 text-ink-400" />
          <Input
            label="Confirm password"
            type={show ? 'text' : 'password'}
            placeholder="Type it again"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); if (error) setError() }}
            error={error}
            className="[&_input]:pl-9"
          />
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? (<><Spinner size={18} /> Updating...</>) : 'Update password'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">Back to sign in</Link>
      </p>
    </AuthShell>
  )
}
