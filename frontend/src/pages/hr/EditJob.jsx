import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Users } from 'lucide-react'
import JobForm from '../../components/JobForm'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Button from '../../components/ui/Button'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import { useToast } from '../../context/ToastContext'

export default function EditJob() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const { data, loading, error } = useFetch(() => api.get(`/jobs/${id}`), [id])
  const job = data?.job

  const save = async (payload) => {
    try {
      await api.put(`/jobs/${id}`, payload)
      toast.success('Job updated')
      navigate('/hr/jobs')
    } catch (err) {
      toast.error(err.message || 'Could not save the job')
      throw err // keeps the form's button enabled
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20 text-brand-600"><Spinner size={28} /></div>
  }
  if (error || !job) {
    return (
      <EmptyState
        title="Job not found"
        description={error || 'This job may have been deleted.'}
        action={<Button as={Link} to="/hr/jobs" variant="secondary">Back to jobs</Button>}
      />
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link to="/hr/jobs" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Back to jobs
      </Link>

      <div>
        <h2 className="text-xl font-bold text-ink-900">Edit job</h2>
        <p className="flex items-center gap-1.5 text-sm text-ink-500">
          <Users className="h-3.5 w-3.5" />
          {job.applicantsCount} applicant{job.applicantsCount === 1 ? '' : 's'} so far
        </p>
      </div>

      {job.applicantsCount > 0 && (
        <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
          Raising the apply threshold won&apos;t remove anyone who has already applied, and
          interviews already in progress keep the questions they started with.
        </p>
      )}

      <JobForm
        initial={job}
        onSubmit={save}
        onCancel={() => navigate('/hr/jobs')}
        submitLabel="Save changes"
        savingLabel="Saving…"
        showStatus
      />
    </div>
  )
}
