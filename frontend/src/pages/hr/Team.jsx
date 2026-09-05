import { useState } from 'react'
import { Mail, UserPlus, Shield, Link2, Copy, Check, Trash2, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Select } from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { api } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import { useToast } from '../../context/ToastContext'

const roleTone = { Admin: 'brand', Recruiter: 'blue', Viewer: 'gray' }

function initials(name = '') {
  return name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase() || '?'
}
const inviteLink = (code) => `${window.location.origin}/register?invite=${code}`

export default function Team() {
  const toast = useToast()
  const { data, loading, error } = useFetch(() => api.get('/team'), [])
  const { data: invitesData, reload: reloadInvites } = useFetch(() => api.get('/team/invites'), [])

  const [role, setRole] = useState('Recruiter')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState('')

  if (loading) return <div className="flex justify-center py-20 text-brand-600"><Spinner size={28} /></div>
  if (error) return <EmptyState title="Couldn’t load your team" description={error} />

  const members = data.members || []
  const invites = invitesData?.invites || []
  const hasCompany = Boolean(data.company)

  const createInvite = async () => {
    setCreating(true)
    try {
      const res = await api.post('/team/invite', { role })
      await copy(res.invite.code)
      toast.success('Invite link created and copied — share it with your teammate.')
      reloadInvites()
    } catch (err) {
      toast.error(err.message || 'Could not create invite')
    } finally {
      setCreating(false)
    }
  }

  const copy = async (code) => {
    try {
      await navigator.clipboard.writeText(inviteLink(code))
      setCopied(code)
      setTimeout(() => setCopied(''), 1500)
    } catch { /* clipboard blocked — link is still visible to select */ }
  }

  const revoke = async (code) => {
    try {
      await api.del(`/team/invite/${code}`)
      toast.success('Invite revoked.')
      reloadInvites()
    } catch (err) {
      toast.error(err.message || 'Could not revoke')
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Team</h2>
        <p className="text-sm text-ink-500">
          {hasCompany ? `${data.company}’s recruiters` : 'Your recruiter account'}
        </p>
      </div>

      {/* Invite */}
      <Card>
        <CardHeader title="Invite a teammate" subtitle="Create a link and share it — they join your company on sign-up" />
        <CardBody className="space-y-4">
          {!hasCompany ? (
            <p className="text-sm text-ink-500">Add your company in settings to invite teammates.</p>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Select value={role} onChange={(e) => setRole(e.target.value)} className="sm:w-44">
                  <option>Recruiter</option>
                  <option>Admin</option>
                  <option>Viewer</option>
                </Select>
                <Button onClick={createInvite} disabled={creating} className="sm:w-auto">
                  {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : <><UserPlus className="h-4 w-4" /> Create invite link</>}
                </Button>
              </div>

              {invites.length > 0 && (
                <div className="space-y-2 border-t border-ink-100 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Pending invite links</p>
                  {invites.map((inv) => (
                    <div key={inv.code} className="flex items-center gap-2 rounded-lg border border-ink-100 p-2">
                      <Link2 className="h-4 w-4 shrink-0 text-ink-400" />
                      <input
                        readOnly
                        value={inviteLink(inv.code)}
                        onFocus={(e) => e.target.select()}
                        className="min-w-0 flex-1 bg-transparent text-xs text-ink-600 outline-none"
                      />
                      <Badge tone={roleTone[inv.role]}>{inv.role}</Badge>
                      <button onClick={() => copy(inv.code)} className="rounded-md p-1.5 text-ink-500 hover:bg-ink-50" title="Copy link">
                        {copied === inv.code ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      </button>
                      <button onClick={() => revoke(inv.code)} className="rounded-md p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600" title="Revoke">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader title="Members" subtitle={`${members.length} ${members.length === 1 ? 'person' : 'people'}`} />
        <CardBody className="p-0">
          <div className="divide-y divide-ink-100">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  {m.photoUrl ? (
                    <img src={m.photoUrl} alt={m.name} className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                      {initials(m.name)}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                      {m.name}
                      {m.isYou && <span className="text-xs font-normal text-ink-400">(you)</span>}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-ink-500">
                      <Mail className="h-3 w-3" /> {m.email}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone="green">Active</Badge>
                  <Badge tone={roleTone[m.role]}><Shield className="h-3 w-3" /> {m.role}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
