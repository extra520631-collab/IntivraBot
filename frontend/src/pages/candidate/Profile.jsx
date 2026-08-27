import { useRef, useState } from 'react'
import { Camera, Mic, Upload, X, Loader2, FileText, ScanFace, ExternalLink, Download } from 'lucide-react'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import CameraCapture from '../../components/CameraCapture'
import VoiceEnroll from '../../components/VoiceEnroll'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { skillOptions } from '../../data/mockData'

function initials(name = '') {
  return name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase() || '?'
}

export default function CandidateProfile() {
  const { user, setUser } = useAuth()
  const toast = useToast()

  const photoRef = useRef(null)
  const resumeRef = useRef(null)

  const [name, setName] = useState(user?.name || '')
  const [headline, setHeadline] = useState(user?.profile?.headline || '')
  const [location, setLocation] = useState(user?.profile?.location || '')
  const [experienceYears, setExperienceYears] = useState(user?.profile?.experienceYears ?? 0)
  const [skills, setSkills] = useState(user?.profile?.skills || [])
  const [skillQuery, setSkillQuery] = useState('')

  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingResume, setUploadingResume] = useState(false)
  const [openingResume, setOpeningResume] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)

  if (!user) {
    return <div className="flex justify-center py-20 text-brand-600"><Spinner size={28} /></div>
  }

  const toggleSkill = (s) =>
    setSkills((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))

  const addSkill = (raw) => {
    const value = String(raw || '').trim()
    if (!value) return
    setSkills((cur) =>
      cur.some((x) => x.toLowerCase() === value.toLowerCase()) ? cur : [...cur, value]
    )
    setSkillQuery('')
  }

  // Suggestions from the catalogue — capped, because it runs to ~150 entries.
  const q = skillQuery.trim().toLowerCase()
  const suggestions = q
    ? skillOptions
        .filter((s) => s.toLowerCase().includes(q) && !skills.some((x) => x.toLowerCase() === s.toLowerCase()))
        .slice(0, 12)
    : []

  const save = async () => {
    if (name.trim().length < 2) {
      toast.error('Please enter your full name.')
      return
    }
    setSaving(true)
    try {
      const res = await api.patch('/auth/me', {
        name: name.trim(),
        profile: {
          headline: headline.trim(),
          location: location.trim(),
          experienceYears: Number(experienceYears) || 0,
          skills,
        },
      })
      setUser(res.user)
      toast.success('Profile saved.')
    } catch (err) {
      toast.error(err.message || 'Could not save your profile')
    } finally {
      setSaving(false)
    }
  }

  // Shared by the file picker and the live camera capture.
  const uploadPhotoFile = async (file) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return toast.error('Image is too large (max 5 MB).')
    setUploadingPhoto(true)
    try {
      const res = await api.upload('/uploads/photo', file)
      setUser((u) => ({ ...u, photoUrl: res.url }))
      setCameraOpen(false)
      toast.success('Photo updated.')
    } catch (err) {
      toast.error(err.message || 'Could not upload the photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const onPhoto = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    uploadPhotoFile(file)
  }

  const onResume = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return toast.error('File is too large (max 5 MB).')
    setUploadingResume(true)
    try {
      const res = await api.upload('/uploads/resume', file)
      setUser((u) => ({ ...u, profile: { ...u.profile, resumeUrl: res.url } }))
      toast.success('Resume uploaded.')
    } catch (err) {
      toast.error(err.message || 'Could not upload the resume')
    } finally {
      setUploadingResume(false)
    }
  }

  const resumeUrl = user.profile?.resumeUrl

  // The CV is streamed through our API (Cloudinary blocks direct PDF delivery),
  // so it needs an authenticated fetch rather than a plain link.
  const openResume = async (download = false) => {
    // Open the tab up-front — doing it after the await trips popup blockers.
    const tab = download ? null : window.open('', '_blank')
    setOpeningResume(true)
    try {
      const url = await api.blobUrl(`/uploads/resume${download ? '?download=1' : ''}`)
      if (download) {
        const a = document.createElement('a')
        a.href = url
        a.download = user.profile?.resumeName || 'cv'
        a.click()
      } else if (tab) {
        tab.location = url
      }
      // Give the tab/download a moment to take hold before releasing the blob.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      tab?.close()
      toast.error(err.message || (download ? 'Could not download your CV' : 'Could not open your CV'))
    } finally {
      setOpeningResume(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Identity */}
      <div className="card-base p-6">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <div className="relative">
            {user.photoUrl ? (
              <img
                src={user.photoUrl}
                alt={user.name}
                className="h-20 w-20 rounded-2xl object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white">
                {initials(user.name)}
              </div>
            )}
            <input ref={photoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPhoto} />
            <button
              onClick={() => photoRef.current?.click()}
              disabled={uploadingPhoto}
              title="Change photo"
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-ink-900 text-white disabled:opacity-60"
            >
              {uploadingPhoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-ink-900">{user.name}</h1>
            <p className="text-sm text-ink-500">
              {[user.profile?.headline, user.profile?.location].filter(Boolean).join(' · ') || user.email}
            </p>
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save changes'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Basic info */}
        <Card>
          <CardHeader title="Basic information" />
          <CardBody className="space-y-4">
            <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Email" type="email" value={user.email} disabled hint="Email can’t be changed here." />
            <Input label="Headline" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. Frontend Developer" />
            <Input label="Location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Lahore, Pakistan" />
            <Input
              label="Years of experience"
              type="number"
              min={0}
              max={50}
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value)}
            />
          </CardBody>
        </Card>

        {/* Skills */}
        <Card>
          <CardHeader title="Skills" subtitle="AI matching finds jobs close to these" />
          <CardBody>
            {/* Your skills — the catalogue is far too long to dump on screen,
                so it lives behind the search box below. */}
            {skills.length === 0 ? (
              <p className="rounded-lg border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-400">
                No skills yet — search below to add some.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-500 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => toggleSkill(s)}
                      aria-label={`Remove ${s}`}
                      className="text-brand-400 transition hover:text-brand-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4">
              <Input
                label="Add a skill"
                value={skillQuery}
                placeholder="Search, or type your own and press Enter"
                onChange={(e) => setSkillQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  addSkill(suggestions[0] || skillQuery)
                }}
              />
            </div>

            {skillQuery.trim() && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {suggestions.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => addSkill(skillQuery)}
                    className="rounded-full border border-dashed border-ink-300 px-3 py-1 text-xs font-medium text-ink-500 transition hover:border-brand-400 hover:text-brand-600"
                  >
                    + Add “{skillQuery.trim()}”
                  </button>
                ) : (
                  suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addSkill(s)}
                      className="rounded-full border border-ink-200 px-3 py-1 text-xs font-medium text-ink-500 transition hover:border-brand-400 hover:text-brand-600"
                    >
                      + {s}
                    </button>
                  ))
                )}
              </div>
            )}

            <p className="mt-3 text-xs text-ink-400">
              {skills.length} selected — remember to “Save changes”.
            </p>
          </CardBody>
        </Card>
      </div>

      {/* Verification assets */}
      <Card>
        <CardHeader title="Verification & documents" subtitle="Used to confirm your identity during interviews" />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          {/* Resume — real upload */}
          <div className="rounded-xl border border-ink-200 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <FileText className="h-5 w-5" />
            </span>
            <div className="mt-3 text-sm font-semibold text-ink-900">Resume / CV</div>
            <input ref={resumeRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={onResume} />
            <div className="mt-2 flex items-center justify-between gap-2">
              {resumeUrl ? (
                <span className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => openResume(false)}
                    disabled={openingResume}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline disabled:opacity-50 disabled:pointer-events-none"
                  >
                    View {openingResume ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => openResume(true)}
                    disabled={openingResume}
                    className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800 hover:underline disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Save {openingResume ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  </button>
                </span>
              ) : (
                <span className="text-xs text-ink-400">Not uploaded</span>
              )}
              <Button variant="secondary" size="sm" onClick={() => resumeRef.current?.click()} disabled={uploadingResume}>
                {uploadingResume ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {resumeUrl ? 'Replace' : 'Upload'}
              </Button>
            </div>
          </div>

          {/* Face baseline — the photo interviews match your live frames against */}
          <div className="rounded-xl border border-ink-200 p-4">
            {user.photoUrl ? (
              <img src={user.photoUrl} alt="Face baseline" className="h-10 w-10 rounded-lg object-cover" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <ScanFace className="h-5 w-5" />
              </span>
            )}
            <div className="mt-3 text-sm font-semibold text-ink-900">Face baseline</div>
            <div className="mt-2 flex items-center justify-between gap-2">
              {user.photoUrl ? (
                <Badge tone="green">Ready</Badge>
              ) : (
                <span className="text-xs text-ink-400">Not set</span>
              )}
              <Button variant="secondary" size="sm" onClick={() => setCameraOpen(true)} disabled={uploadingPhoto}>
                {uploadingPhoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                {user.photoUrl ? 'Retake' : 'Capture'}
              </Button>
            </div>
          </div>

          {/* Voice sample — enrolls an account-level voiceprint */}
          <div className="rounded-xl border border-ink-200 p-4">
            <span className={
              'flex h-10 w-10 items-center justify-center rounded-lg ' +
              (user.profile?.voiceEnrolled ? 'bg-green-50 text-green-600' : 'bg-brand-50 text-brand-600')
            }>
              <Mic className="h-5 w-5" />
            </span>
            <div className="mt-3 text-sm font-semibold text-ink-900">Voice sample</div>
            <div className="mt-2 flex items-center justify-between gap-2">
              {user.profile?.voiceEnrolled ? (
                <Badge tone="green">Enrolled</Badge>
              ) : (
                <span className="text-xs text-ink-400">Not set</span>
              )}
              <Button variant="secondary" size="sm" onClick={() => setVoiceOpen(true)}>
                <Mic className="h-3.5 w-3.5" />
                {user.profile?.voiceEnrolled ? 'Re-record' : 'Record'}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {cameraOpen && (
        <CameraCapture
          onCapture={uploadPhotoFile}
          onClose={() => setCameraOpen(false)}
          busy={uploadingPhoto}
        />
      )}

      {voiceOpen && (
        <VoiceEnroll
          onClose={() => setVoiceOpen(false)}
          onDone={() => {
            setVoiceOpen(false)
            setUser((u) => ({ ...u, profile: { ...u.profile, voiceEnrolled: true } }))
            toast.success('Voiceprint enrolled — interviews can verify you now.')
          }}
        />
      )}
    </div>
  )
}
