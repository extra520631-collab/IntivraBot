import { useState, useRef, useEffect } from 'react'
import { Mic, Square, X, ShieldCheck } from 'lucide-react'
import Button from './ui/Button'
import Spinner from './ui/Spinner'
import { createRecorder } from '../lib/audio'
import { api } from '../lib/api'
import { cn } from '../lib/cn'

const MIN_SECONDS = 4
const MAX_SECONDS = 15

// Read aloud so the clip has enough varied speech for a stable voiceprint.
const PROMPT = 'My name is on my profile, and I am recording this sample to verify my identity for my IntivraBot interviews.'

/**
 * Records a short clip and enrolls it as the account voiceprint. Only the
 * embedding is stored server-side — the audio itself is never uploaded to
 * storage.
 */
export default function VoiceEnroll({ onDone, onClose }) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const recorderRef = useRef(null)
  const timerRef = useRef(null)

  // Never leave the mic open if the dialog closes mid-recording.
  useEffect(() => () => {
    clearInterval(timerRef.current)
    recorderRef.current?.cancel()
  }, [])

  const start = async () => {
    setError('')
    try {
      recorderRef.current = await createRecorder({ onLevel: setLevel })
    } catch {
      setError('Microphone access was blocked. Allow it in your browser and try again.')
      return
    }
    setSeconds(0)
    setRecording(true)
    let elapsed = 0
    timerRef.current = setInterval(() => {
      elapsed += 1
      setSeconds(elapsed)
      if (elapsed >= MAX_SECONDS) stop() // hard cap, saves what we have
    }, 1000)
  }

  const stop = async () => {
    clearInterval(timerRef.current)
    const rec = recorderRef.current
    recorderRef.current = null
    if (!rec) return
    setRecording(false)
    setLevel(0)

    const clip = rec.stop()
    if (!clip || clip.seconds < MIN_SECONDS) {
      setError(`That was too short — record at least ${MIN_SECONDS} seconds.`)
      return
    }

    setSaving(true)
    try {
      await api.post('/uploads/voice', { audio: clip.base64, sampleRate: clip.sampleRate })
      onDone?.()
    } catch (err) {
      setError(err.message || 'Could not enroll your voice. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-ink-900">Record your voice sample</h3>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1 text-ink-400 hover:bg-ink-50 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-ink-500">Read this out in your normal speaking voice:</p>
        <blockquote className="mt-2 rounded-xl border-l-4 border-brand-500 bg-brand-50 p-3 text-sm text-ink-800">
          “{PROMPT}”
        </blockquote>

        {/* Level meter — gives the candidate proof the mic is actually live. */}
        <div className="mt-4 flex items-center gap-3">
          <span className={cn(
            'flex h-11 w-11 items-center justify-center rounded-full transition',
            recording ? 'bg-red-50 text-red-600' : 'bg-ink-100 text-ink-400'
          )}>
            <Mic className={cn('h-5 w-5', recording && 'animate-pulse')} />
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
            <div
              className={cn('h-full rounded-full transition-all duration-100', recording ? 'bg-red-500' : 'bg-ink-200')}
              style={{ width: `${Math.min(100, Math.round(level * 180))}%` }}
            />
          </div>
          <span className="w-14 text-right text-sm font-medium tabular-nums text-ink-600">
            {String(seconds).padStart(2, '0')}s
          </span>
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

        <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-400">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Only a mathematical voiceprint is saved — the recording itself is never stored.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          {recording ? (
            <Button size="sm" variant="danger" onClick={stop}>
              <Square className="h-4 w-4" /> Stop &amp; save
            </Button>
          ) : (
            <Button size="sm" onClick={start} disabled={saving}>
              {saving ? <><Spinner size={16} /> Enrolling…</> : <><Mic className="h-4 w-4" /> Start recording</>}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
