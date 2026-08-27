import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { User, Building2, Building } from 'lucide-react'
import AuthShell from './AuthShell'
import { Input } from '../../components/ui/Input'
import PasswordInput from '../../components/ui/PasswordInput'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { validateRegister } from '../../lib/validators'
import { cn } from '../../lib/cn'

export default function Register() {
  const { register } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const inviteCode = params.get('invite') || ''
  const [invite, setInvite] = useState(null) // { valid, company, role }
  const [role, setRole] = useState('candidate')
  const [form, setForm] = useState({ name: '', email: '', password: '', company: '', agree: false })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  // A team invite locks the account to HR + the inviting company.
  useEffect(() => {
    if (!inviteCode) return
    let alive = true
    api.get(`/team/invite/${inviteCode}`)
      .then((d) => { if (alive) { setInvite(d); if (d.valid) setRole('hr') } })
      .catch(() => { if (alive) setInvite({ valid: false }) })
    return () => { alive = false }
  }, [inviteCode])

  const joining = invite?.valid

  const set = (k) => (e) => {
    const val = k === 'agree' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [k]: val }))
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }))
  }

  const submit = async (e) => {
    e.preventDefault()
    const errs = validateRegister(form)
    // A self-serve HR account needs a company — without it the team, invites
    // and job listings have nothing to group under.
    if (role === 'hr' && !joining && form.company.trim().length < 2) {
      errs.company = 'Enter your company name.'
    }
    setErrors(errs)
    if (Object.keys(errs).length) return

    setLoading(true)
    try {
      const created = await register({
        name: form.name.trim(),
        email: form.email,
        password: form.password,
        role,
        ...(role === 'hr' && !joining ? { company: form.company.trim() } : {}),
        ...(joining ? { inviteCode } : {}),
      })
      toast.success('Account created! Let’s set up your profile.')
      navigate(created.role === 'hr' ? '/hr/onboarding' : '/candidate/onboarding')
    } catch (err) {
      toast.error(err.message || 'Could not create account')
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold text-ink-900">Create your account</h1>
      <p className="mt-1 text-sm text-ink-500">
        {joining ? 'Complete your details to join the team.' : 'Choose how you want to use IntivraBot.'}
      </p>

      {joining ? (
        /* Team invite — role & company are fixed */
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Building className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-ink-900">Joining {invite.company}</div>
            <div className="text-xs text-ink-500">You’ll sign up as {invite.role || 'Recruiter'} (HR).</div>
          </div>
        </div>
      ) : invite && !invite.valid ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          This invite link is invalid or has expired — you can still create a normal account below.
        </div>
      ) : (
        /* Role cards */
        <div className="mt-6 grid grid-cols-2 gap-3">
          {[
            ['candidate', 'Candidate', 'Find jobs & interview', User],
            ['hr', 'HR Manager', 'Hire & shortlist', Building2],
          ].map(([val, label, desc, Icon]) => (
            <button
              key={val}
              type="button"
              onClick={() => setRole(val)}
              className={cn(
                'rounded-xl border p-4 text-left transition',
                role === val
                  ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
                  : 'border-ink-200 hover:border-ink-300'
              )}
            >
              <Icon className={cn('h-5 w-5', role === val ? 'text-brand-600' : 'text-ink-400')} />
              <div className="mt-2 text-sm font-semibold text-ink-900">{label}</div>
              <div className="text-xs text-ink-500">{desc}</div>
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <Input
          label="Full name"
          placeholder="e.g. Ali Raza"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
        />
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
        />
        {/* HR accounts are grouped by company — it drives the team, invites and
            the company shown on every job they post. Invited HRs inherit it. */}
        {role === 'hr' && !joining && (
          <Input
            label="Company name"
            placeholder="e.g. TechNova"
            value={form.company}
            onChange={set('company')}
            error={errors.company}
            hint="Your team and job postings are grouped under this name."
          />
        )}
        <PasswordInput
          label="Password"
          placeholder="Min 8 characters"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          hint={!form.password ? 'Use letters, numbers & a symbol.' : undefined}
          showMeter
        />
        <div>
          <label className="flex items-start gap-2 text-xs text-ink-500">
            <input
              type="checkbox"
              checked={form.agree}
              onChange={set('agree')}
              className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
            />
            I agree to the Terms and consent to face &amp; voice processing for interview verification.
          </label>
          {errors.agree && <p className="mt-1 text-xs text-red-600">{errors.agree}</p>}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? (<><Spinner size={18} /> Creating account…</>) : 'Create account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">Sign in</Link>
      </p>
    </AuthShell>
  )
}
