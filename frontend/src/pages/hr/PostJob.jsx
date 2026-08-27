import { useNavigate } from 'react-router-dom'
import JobForm from '../../components/JobForm'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

export default function PostJob() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()

  const publish = async (payload) => {
    try {
      await api.post('/jobs', payload)
      toast.success('Job published!')
      navigate('/hr/jobs')
    } catch (err) {
      toast.error(err.message || 'Could not publish job')
      throw err // keeps the form's button enabled
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Post a new job</h2>
        <p className="text-sm text-ink-500">Set the requirements and thresholds — AI handles the rest.</p>
      </div>

      <JobForm
        // Seeded from the hiring defaults saved during HR onboarding.
        initial={{
          applyThreshold: user?.hiring?.applyThreshold ?? 70,
          passThreshold: user?.hiring?.passThreshold ?? 80,
        }}
        onSubmit={publish}
        onCancel={() => navigate('/hr/jobs')}
        submitLabel="Publish job"
        savingLabel="Publishing…"
      />
    </div>
  )
}
