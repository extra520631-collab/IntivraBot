import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight, ChevronLeft } from 'lucide-react'
import Logo from '../../components/ui/Logo'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { Input, Select } from '../../components/ui/Input'
import { cn } from '../../lib/cn'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

const steps = ['Company', 'Role', 'Hiring defaults']

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
            value === o ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600 hover:border-ink-300'
          )}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

export default function HrOnboarding() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user, setUser } = useAuth()

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const [company, setCompany] = useState(user?.company || '')
  const [industry, setIndustry] = useState(user?.hiring?.industry || 'IT / Software')
  const [size, setSize] = useState(user?.hiring?.size || '11-50')
  const [designation, setDesignation] = useState(user?.hiring?.designation || 'HR Manager')
  const [departments, setDepartments] = useState(user?.hiring?.departments || '')
  const [applyThreshold, setApplyThreshold] = useState(user?.hiring?.applyThreshold ?? 70)
  const [passThreshold, setPassThreshold] = useState(user?.hiring?.passThreshold ?? 80)
  const [language, setLanguage] = useState(user?.hiring?.language || 'English')
  const [questionsPerInterview, setQuestionsPerInterview] = useState(user?.hiring?.questionsPerInterview ?? 5)

  const finish = async () => {
    if (company.trim().length < 2) {
      setStep(0)
      return toast.error('Please enter your company name.')
    }
    if (Number(passThreshold) < Number(applyThreshold)) {
      return toast.error('Pass threshold must be greater than or equal to the apply threshold.')
    }

    setSaving(true)
    try {
      const res = await api.patch('/auth/me', {
        company: company.trim(),
        hiring: {
          industry,
          size,
          designation,
          departments: departments.trim(),
          applyThreshold: Number(applyThreshold),
          passThreshold: Number(passThreshold),
          language,
          questionsPerInterview: Number(questionsPerInterview),
        },
      })
      setUser(res.user)
      toast.success('Company profile saved.')
      navigate('/hr')
    } catch (err) {
      toast.error(err.message || 'Could not save your details')
      setSaving(false)
    }
  }

  const next = () => (step < steps.length - 1 ? setStep(step + 1) : finish())
  const back = () => step > 0 && setStep(step - 1)

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <Logo className="mb-8" />

        <div className="mb-8 flex items-center">
          {steps.map((s, i) => (
            <div key={s} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <div className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold',
                  i < step ? 'bg-brand-600 text-white' : i === step ? 'bg-brand-600 text-white ring-4 ring-brand-100' : 'bg-ink-100 text-ink-400'
                )}>
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className={cn('mt-1.5 text-xs font-medium', i <= step ? 'text-ink-700' : 'text-ink-400')}>{s}</span>
              </div>
              {i < steps.length - 1 && <div className={cn('mx-2 h-0.5 flex-1', i < step ? 'bg-brand-600' : 'bg-ink-200')} />}
            </div>
          ))}
        </div>

        <div className="card-base p-6 sm:p-8">
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-ink-900">Company details</h2>
                <p className="mt-1 text-sm text-ink-500">Tell us about your company.</p>
              </div>
              <Input
                label="Company name"
                placeholder="e.g. TechNova"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                hint="Your team, invites and job postings are grouped under this name."
              />
              <div>
                <label className="label-base">Industry</label>
                <OptionGrid options={['IT / Software', 'Marketing', 'Finance', 'Education']} value={industry} onChange={setIndustry} />
              </div>
              <div>
                <label className="label-base">Company size</label>
                <OptionGrid options={['1-10', '11-50', '51-200', '200+']} value={size} onChange={setSize} />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-ink-900">Your role</h2>
                <p className="mt-1 text-sm text-ink-500">What you do at the company.</p>
              </div>
              <div>
                <label className="label-base">Designation</label>
                <OptionGrid options={['Recruiter', 'HR Manager', 'Team Lead', 'Founder']} value={designation} onChange={setDesignation} />
              </div>
              <Input
                label="Departments you hire for"
                placeholder="e.g. Engineering, Design"
                value={departments}
                onChange={(e) => setDepartments(e.target.value)}
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-ink-900">Default hiring settings</h2>
                <p className="mt-1 text-sm text-ink-500">You can change these per job.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Default apply threshold %"
                  type="number" min={0} max={100}
                  value={applyThreshold}
                  onChange={(e) => setApplyThreshold(e.target.value)}
                />
                <Input
                  label="Default pass threshold %"
                  type="number" min={0} max={100}
                  value={passThreshold}
                  onChange={(e) => setPassThreshold(e.target.value)}
                />
              </div>
              <Select label="Default interview language" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option>English</option>
                <option>Urdu</option>
                <option>Both</option>
              </Select>
              <Select
                label="Default questions per interview"
                value={questionsPerInterview}
                onChange={(e) => setQuestionsPerInterview(e.target.value)}
              >
                <option>5</option>
                <option>8</option>
                <option>10</option>
              </Select>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={back} disabled={step === 0 || saving}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={next} disabled={saving}>
              {saving ? (
                <><Spinner size={18} /> Saving…</>
              ) : (
                <>{step === steps.length - 1 ? 'Save & go to dashboard' : 'Continue'} <ChevronRight className="h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
