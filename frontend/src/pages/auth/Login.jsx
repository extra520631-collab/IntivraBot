import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import AuthShell from './AuthShell'
import { Input } from '../../components/ui/Input'
import PasswordInput from '../../components/ui/PasswordInput'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { validateLogin } from '../../lib/validators'
import { cn } from '../../lib/cn'

export default function Login() {
  const { login, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [role, setRole] = useState('candidate')
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }))
  }

  const submit = async (e) => {
    e.preventDefault()
    const errs = validateLogin(form)
    setErrors(errs)
    if (Object.keys(errs).length) return

    setLoading(true)
    try {
      const user = await login({ email: form.email, password: form.password })

      // The toggle is a real choice, not decoration: signing in as Candidate
      // with an HR account (or the reverse) is almost always the wrong tab
      // rather than the wrong password. `login` has already stored the token,
      // so drop it again before reporting the mismatch.
      if (user.role !== role) {
        logout()
        const actual = user.role === 'hr' ? 'HR Manager' : 'Candidate'
        setErrors({ password: `This is a ${actual} account — switch to the ${actual} tab to sign in.` })
        toast.error(`Selected ${role === 'hr' ? 'HR Manager' : 'Candidate'}, but this is a ${actual} account.`)
        setLoading(false)
        return
      }

      toast.success('Welcome back!')
      navigate(user.role === 'hr' ? '/hr' : '/candidate')
    } catch (err) {
      toast.error(err.message || 'Sign in failed')
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold text-ink-900">Welcome back</h1>
      <p className="mt-1 text-sm text-ink-500">Sign in to continue to IntivraBot.</p>

      {/* Role toggle */}
      <div className="mt-6 grid grid-cols-2 gap-1 rounded-lg bg-ink-100 p-1">
        {[
          ['candidate', 'Candidate'],
          ['hr', 'HR Manager'],
        ].map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => { setRole(val); setErrors((p) => ({ ...p, password: undefined })) }}
            className={cn(
              'rounded-md py-2 text-sm font-semibold transition',
              role === val ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-[38px] h-4 w-4 text-ink-400" />
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={set('email')}
            error={errors.email}
            className="[&_input]:pl-9"
          />
        </div>
        <PasswordInput
          label="Password"
          placeholder="••••••••"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
        />
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-ink-600">
            <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500" />
            Remember me
          </label>
          <Link to="/forgot-password" className="font-medium text-brand-600 hover:text-brand-700">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? (<><Spinner size={18} /> Signing in…</>) : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">Create one</Link>
      </p>
    </AuthShell>
  )
}
