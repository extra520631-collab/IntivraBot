import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import {
  ScanFace, Mic, Video, Type, ShieldCheck, AlertTriangle,
  ChevronRight, Volume2, Loader2, CheckCircle2, XCircle, Square, Smile, Sparkles,
} from 'lucide-react'
import Logo from '../../components/ui/Logo'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Progress from '../../components/ui/Progress'
import Spinner from '../../components/ui/Spinner'
import { Select } from '../../components/ui/Input'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../lib/cn'

const textReasons = [
  'Microphone not working',
  'Slow internet (voice lag)',
  'Noisy environment',
  'Speech / hearing difficulty',
]

// Browser speech-to-text (Chrome/Edge). Undefined elsewhere → we fall back to typing.
const SpeechRecognition =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

// How often the webcam is sampled during the interview. Fast enough that
// nobody can swap places between reads, slow enough not to flood a small
// server or a candidate's uplink.
const FRAME_INTERVAL_MS = 4000
// Recent frames kept in memory to smooth the on-screen status. A single bad
// frame should never make the UI shout at the candidate.
const HISTORY_LEN = 5

export default function Interview() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  // applicationId comes from JobDetail / Applications via router state, or ?application=<id>.
  const search = new URLSearchParams(location.search)
  const applicationId = location.state?.applicationId || search.get('application')
  // A practice run has no application — the topic drives the questions instead.
  const practiceTopic = location.state?.practiceTopic || search.get('practice')
  const isPractice = Boolean(practiceTopic) && !applicationId
  const language = location.state?.language || 'English'

  const [phase, setPhase] = useState('loading') // loading | active | submitting | finishing | error
  const [error, setError] = useState('')
  const [geminiEnabled, setGeminiEnabled] = useState(false)
  const [faceEnabled, setFaceEnabled] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [camOn, setCamOn] = useState(false)
  const [live, setLive] = useState(null) // { faceCount, singlePerson, emotion, match, quality, baselineAvailable }
  const [liveVoice, setLiveVoice] = useState(null) // { match, multiVoice, isReference }
  // Recent frames, used to decide what the candidate is shown — see liveRows.
  const [frameHistory, setFrameHistory] = useState([])

  const [interview, setInterview] = useState(null)
  const [current, setCurrent] = useState(null) // { order, text }
  const [total, setTotal] = useState(5)

  const [mode, setMode] = useState('voice') // 'voice' | 'text'
  const [reason, setReason] = useState('')
  const [answer, setAnswer] = useState('')
  const [recording, setRecording] = useState(false)
  const [lastResult, setLastResult] = useState(null) // { score, feedback } shown after each answer

  const recognitionRef = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  // Guards the frame loop against overlapping uploads on a slow connection.
  const frameInFlightRef = useRef(false)
  // Set while an answer is being scored, so monitoring stands down rather than
  // competing with it for the AI service.
  const submittingRef = useRef(false)
  const streamRef = useRef(null)
  // Audio capture for voice biometrics
  const audioCtxRef = useRef(null)
  const audioStreamRef = useRef(null)
  const processorRef = useRef(null)
  const pcmChunksRef = useRef([])
  const capturingRef = useRef(false)
  const srcSampleRateRef = useRef(16000)

  // ── Start (or resume) the interview once on mount ───────────────────────────
  useEffect(() => {
    if (!applicationId && !isPractice) {
      setPhase('error')
      setError('no-application')
      return
    }
    let alive = true
    ;(async () => {
      try {
        const res = isPractice
          ? await api.post('/interviews/practice', { topic: practiceTopic, language })
          : await api.post('/interviews/start', { applicationId, language })
        if (!alive) return
        setInterview(res.interview)
        setTotal(res.interview?.totalQuestions || 5)
        setCurrent(res.currentQuestion)
        setGeminiEnabled(Boolean(res.geminiEnabled))
        setFaceEnabled(Boolean(res.faceEnabled))
        setVoiceEnabled(Boolean(res.voiceEnabled))
        setPhase('active')
      } catch (err) {
        if (!alive) return
        setError(err.message || 'Could not start the interview')
        setPhase('error')
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Speak the question aloud when it changes (voice mode, demo touch) ────────
  useEffect(() => {
    if (!current || mode !== 'voice') return
    speak(current.text)
    return stopSpeaking
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.order, mode])

  // Stop any recording / speech when leaving the page.
  useEffect(() => () => { stopRecording(); stopSpeaking() }, [])

  // ── Webcam for face + emotion monitoring (Phase 5) ──────────────────────────
  useEffect(() => {
    if (phase !== 'active' || !faceEnabled) return
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // 720p where the camera offers it: the emotion model works on a
          // small aligned crop of the face, so a 480x360 frame leaves it
          // almost no pixels to read once the candidate sits back.
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setCamOn(true)
      } catch {
        setCamOn(false) // permission denied or no camera — degrade gracefully
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, faceEnabled])

  // Release the camera when leaving the page.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  // Monitor continuously, not once per question. One frame per question left
  // most of the interview unobserved: someone could sit down, swap places or
  // read from a second screen between questions and nothing would record it.
  useEffect(() => {
    if (phase !== 'active' || !faceEnabled || !camOn || !interview?._id) return

    let stopped = false
    let timer

    const tick = async () => {
      if (stopped) return
      await captureFrame()
      if (!stopped) timer = setTimeout(tick, FRAME_INTERVAL_MS)
    }
    // Let the camera settle (exposure, autofocus) before the first read.
    timer = setTimeout(tick, 1500)

    return () => { stopped = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn, phase, faceEnabled, interview?._id])

  async function captureFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) return
    // Skip while the tab is hidden: the browser throttles or freezes the video
    // element, so the frame would be stale or black and read as "no face".
    if (typeof document !== 'undefined' && document.hidden) return
    // Pause while an answer is being scored. A frame competing for the same
    // AI service only makes the candidate wait longer for their next question,
    // and the few seconds skipped here change nothing in the record.
    if (submittingRef.current) return
    // Never let a slow round-trip stack up behind the interval.
    if (frameInFlightRef.current) return
    frameInFlightRef.current = true

    // Downscale the long edge to 640px: past that the detector gains nothing
    // and every extra pixel is upload time on a candidate's connection.
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    // 0.8 rather than 0.6: JPEG artefacts at low quality blur exactly the
    // fine detail around the eyes and mouth the emotion model reads.
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)

    try {
      const res = await api.post(`/interviews/${interview._id}/frame`, {
        frame: dataUrl,
        at: Date.now(),
      })
      if (res.ok) {
        setLive(res)
        setFrameHistory((h) => [...h.slice(-(HISTORY_LEN - 1)), {
          singlePerson: res.singlePerson,
          matched: res.match?.matched,
          reliable: res.quality?.usable !== false,
          confidence: res.emotion?.confidence ?? null,
          at: Date.now(),
        }])
      }
    } catch { /* face monitoring is best-effort — never block the interview */ }
    finally { frameInFlightRef.current = false }
  }

  // ── Audio capture for voice biometrics (Phase 6) ────────────────────────────
  useEffect(() => {
    if (phase !== 'active' || !voiceEnabled) return
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        audioStreamRef.current = stream
        const Ctx = window.AudioContext || window.webkitAudioContext
        const ctx = new Ctx()
        audioCtxRef.current = ctx
        srcSampleRateRef.current = ctx.sampleRate
        const source = ctx.createMediaStreamSource(stream)
        const processor = ctx.createScriptProcessor(4096, 1, 1)
        processor.onaudioprocess = (e) => {
          if (!capturingRef.current) return
          pcmChunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)))
        }
        source.connect(processor)
        processor.connect(ctx.destination)
        processorRef.current = processor
      } catch { /* no mic / denied — voice check simply won't run */ }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, voiceEnabled])

  // Release audio resources on unmount.
  useEffect(() => () => {
    try { processorRef.current?.disconnect() } catch { /* ignore */ }
    try { audioCtxRef.current?.close() } catch { /* ignore */ }
    audioStreamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  // Clear any leftover buffer when a new question appears. Capturing itself is
  // only turned on while the candidate is actually recording (see
  // startRecording/stopRecording below) — starting it as soon as the question
  // appears would pick up the TTS reading the question aloud and contaminate
  // the voiceprint sample sent for biometric matching.
  useEffect(() => {
    pcmChunksRef.current = []
    capturingRef.current = false
  }, [current?.order])

  // Downsample Float32 @ srcSR to 16 kHz Int16.
  function toInt16_16k(input, srcSR) {
    const target = 16000
    const ratio = srcSR / target
    const outLen = Math.max(0, Math.floor(input.length / ratio))
    const out = new Int16Array(outLen)
    for (let i = 0; i < outLen; i++) {
      const idx = i * ratio
      const i0 = Math.floor(idx)
      const frac = idx - i0
      const s = input[i0] * (1 - frac) + (input[i0 + 1] || 0) * frac
      out[i] = Math.max(-1, Math.min(1, s)) * 32767
    }
    return out
  }
  function int16ToBase64(int16) {
    const bytes = new Uint8Array(int16.buffer)
    let bin = ''
    const CHUNK = 0x8000
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
    }
    return btoa(bin)
  }

  // Send the audio captured for the answer just submitted (non-blocking).
  async function sendVoiceClip() {
    if (!voiceEnabled || !interview?._id) return
    capturingRef.current = false
    const chunks = pcmChunksRef.current
    pcmChunksRef.current = []
    if (!chunks.length) return
    const total = chunks.reduce((n, c) => n + c.length, 0)
    const merged = new Float32Array(total)
    let off = 0
    for (const c of chunks) { merged.set(c, off); off += c.length }
    try {
      const pcm16 = toInt16_16k(merged, srcSampleRateRef.current)
      if (pcm16.length < 16000 * 0.4) return // too short to score
      const res = await api.post(`/interviews/${interview._id}/voice`, {
        audio: int16ToBase64(pcm16), sampleRate: 16000,
      })
      if (res.ok) setLiveVoice(res)
    } catch { /* voice check is best-effort */ }
  }

  // Rows for the live-verification card, driven by the latest frame result.
  function liveRows() {
    const rows = []
    // Judge on the recent history rather than the newest frame alone: at one
    // frame every few seconds, a single glance away would otherwise turn the
    // panel red mid-sentence and rattle the candidate for no reason.
    const recent = frameHistory.filter((f) => f.reliable)
    const share = (pred) => (recent.length ? recent.filter(pred).length / recent.length : 0)
    const settled = recent.length >= 2
    // A frame the camera could not capture properly is not evidence.
    const badFrame = live?.quality?.usable === false
    const issue = live?.quality?.issues?.[0]

    // Face match vs the candidate's baseline photo
    if (!faceEnabled) {
      rows.push([ScanFace, 'Face match', 'Off', 'gray'])
    } else if (live && live.baselineAvailable === false) {
      rows.push([ScanFace, 'Face match', 'No baseline photo', 'amber'])
    } else if (live?.match?.score != null) {
      // Only call it a mismatch once it persists; one frame is not proof.
      const persistent = settled && share((f) => f.matched === false) >= 0.5
      rows.push([
        ScanFace,
        'Face match',
        `${live.match.score}%`,
        persistent ? 'red' : live.match.matched ? 'green' : 'amber',
      ])
    } else {
      rows.push([ScanFace, 'Face match', camOn ? 'Checking…' : '—', 'gray'])
    }

    // Camera conditions — actionable, unlike a bare "no face".
    if (faceEnabled && camOn && badFrame) {
      const label =
        issue === 'too_dark' ? 'Too dark' :
        issue === 'too_bright' ? 'Too bright' :
        issue === 'blurry' ? 'Hold still' :
        issue === 'face_too_small' ? 'Move closer' : 'Poor image'
      rows.push([Video, 'Camera', label, 'amber'])
    }

    // Confidence (emotion)
    if (live?.emotion) rows.push([Smile, 'Confidence', `${live.emotion.confidence}%`, live.emotion.confidence >= 50 ? 'green' : 'amber'])
    else rows.push([Smile, 'Confidence', faceEnabled ? (camOn ? 'Reading…' : '—') : 'Off', 'gray'])

    // Single person in frame
    if (live) {
      const val = live.singlePerson ? 'Confirmed' : live.faceCount === 0 ? 'No face' : `${live.faceCount} people`
      const persistent = settled && share((f) => !f.singlePerson) >= 0.5
      rows.push([
        ShieldCheck,
        'Single person',
        val,
        live.singlePerson ? 'green' : persistent ? 'red' : 'amber',
      ])
    } else {
      rows.push([ShieldCheck, 'Single person', '—', 'gray'])
    }
    // Voice match vs the candidate's first answer (reference voiceprint)
    if (!voiceEnabled) rows.push([Mic, 'Voice match', 'Off', 'gray'])
    else if (liveVoice?.multiVoice) rows.push([Mic, 'Voice match', 'Multiple voices', 'red'])
    else if (liveVoice?.match?.score != null) rows.push([Mic, 'Voice match', `${liveVoice.match.score}%`, liveVoice.match.matched ? 'green' : 'red'])
    else if (liveVoice?.isReference) rows.push([Mic, 'Voice match', 'Enrolled', 'green'])
    else rows.push([Mic, 'Voice match', 'Listening…', 'gray'])
    return rows
  }

  function speak(text) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = language === 'Urdu' ? 'ur-PK' : 'en-US'
      window.speechSynthesis.speak(u)
    } catch { /* ignore */ }
  }
  function stopSpeaking() {
    try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
  }

  // ── Voice capture via the Web Speech API ────────────────────────────────────
  function startRecording() {
    if (!SpeechRecognition) return
    stopSpeaking()
    // Start the raw-audio capture for voice biometrics now, not when the
    // question first appeared — otherwise the sample includes the TTS
    // reading the question instead of just the candidate's voice.
    pcmChunksRef.current = []
    capturingRef.current = true
    const rec = new SpeechRecognition()
    rec.lang = language === 'Urdu' ? 'ur-PK' : 'en-US'
    rec.continuous = true
    rec.interimResults = true
    let finalText = answer ? answer + ' ' : ''
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finalText += t + ' '
        else interim += t
      }
      setAnswer((finalText + interim).trimStart())
    }
    rec.onerror = () => { capturingRef.current = false; setRecording(false) }
    rec.onend = () => { capturingRef.current = false; setRecording(false) }
    recognitionRef.current = rec
    rec.start()
    setRecording(true)
  }
  function stopRecording() {
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    recognitionRef.current = null
    capturingRef.current = false
    setRecording(false)
  }

  // ── Submit the current answer ───────────────────────────────────────────────
  const submit = async () => {
    stopRecording()
    stopSpeaking()
    const text = answer.trim()
    if (!text) { setError('Please answer before continuing.'); return }
    if (mode === 'text' && !reason) { setError('Select a reason to use text mode.'); return }
    setError('')
    if (mode === 'voice') sendVoiceClip() // analyse this answer's audio (non-blocking)
    submittingRef.current = true
    setPhase('submitting')
    try {
      const res = await api.post(`/interviews/${interview._id}/answer`, {
        answer: text,
        mode,
        reason: mode === 'text' ? reason : undefined,
      })
      setLastResult({ score: res.score, feedback: res.feedback })
      if (res.done) {
        await finish()
        return
      }
      setCurrent(res.nextQuestion)
      setAnswer('')
      setReason('')
      setPhase('active')
    } catch (err) {
      setError(err.message || 'Could not submit your answer')
      setPhase('active')
    } finally {
      submittingRef.current = false
    }
  }

  const finish = async () => {
    setPhase('finishing')
    try {
      const res = await api.post(`/interviews/${interview._id}/finish`)
      // Practice results are not reports — show them back on the Practice page
      // instead of adding them to "My Reports".
      if (isPractice) {
        navigate('/candidate/practice', { state: { practiceResult: res.interview } })
      } else {
        navigate('/candidate/results', { state: { interview: res.interview } })
      }
    } catch (err) {
      setError(err.message || 'Could not finish the interview')
      setPhase('active')
    }
  }

  // ── Screens ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <FullScreen>
        <div className="max-w-sm text-center">
          <Spinner size={30} />
          <p className="mt-4 text-base font-semibold text-ink-900">Preparing your interview</p>
          <p className="mt-1 text-sm text-ink-500">
            Setting up the camera and generating your first question.
          </p>
        </div>
      </FullScreen>
    )
  }

  if (phase === 'finishing') {
    return (
      <FullScreen>
        <div className="max-w-sm text-center">
          <Spinner size={30} />
          <p className="mt-4 text-base font-semibold text-ink-900">Scoring your interview</p>
          <p className="mt-1 text-sm text-ink-500">
            Reviewing every answer and building your report. This takes a few seconds.
          </p>
        </div>
      </FullScreen>
    )
  }

  if (phase === 'error') {
    const noApp = error === 'no-application'
    return (
      <FullScreen>
        <div className="max-w-md text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
            <XCircle className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-ink-900">
            {noApp ? 'No interview selected' : 'Could not start the interview'}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
            {noApp
              ? 'Open an application first, then start its AI interview.'
              : error}
          </p>
          <Button as={Link} to="/candidate/applications" className="mt-5">
            Go to my applications
          </Button>
        </div>
      </FullScreen>
    )
  }

  const qNumber = current?.order || 1
  const progress = (qNumber / total) * 100
  const last = qNumber >= total
  const busy = phase === 'submitting'

  // Verification is only worth a whole panel when something needs attention;
  // otherwise a single "all clear" line keeps the focus on the question.
  const rows = liveRows()
  const alerts = rows.filter(([, , , tone]) => tone === 'red' || tone === 'amber')
  const monitoringOn = faceEnabled || voiceEnabled

  return (
    <div className="flex min-h-screen flex-col bg-ink-50/40">
      {/* Top bar: identity left, run status right, progress as a hairline
          underneath so it reads at a glance without taking vertical space. */}
      <header className="sticky top-0 z-20 border-b border-ink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />

          <div className="flex items-center gap-2 sm:gap-3">
            {isPractice && (
              <Badge tone="brand">
                <Sparkles className="h-3.5 w-3.5" /> Practice
              </Badge>
            )}
            {(() => {
              // geminiEnabled reflects the service's status at interview start;
              // current?.source reflects whether *this* question actually came
              // from Gemini or the offline bank (e.g. a mid-interview outage).
              const liveNow = geminiEnabled && current?.source !== 'fallback'
              return (
                <span
                  title={liveNow ? 'Questions are being generated live' : 'Using the offline question bank'}
                  className={cn(
                    'hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex',
                    liveNow ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', liveNow ? 'bg-emerald-500' : 'bg-amber-500')} />
                  {liveNow ? 'AI live' : 'Offline mode'}
                </span>
              )
            })()}

            <div className="flex items-baseline gap-1.5 rounded-lg bg-ink-50 px-3 py-1.5">
              <span className="text-sm font-bold tabular-nums text-ink-900">{qNumber}</span>
              <span className="text-xs text-ink-400">/ {total}</span>
            </div>
          </div>
        </div>

        <div className="h-0.5 w-full bg-ink-100">
          <div
            className="h-full bg-brand-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 items-start gap-5 p-4 sm:p-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Left rail: camera, verification, last score. Sticky so it stays put
            while a long answer scrolls. */}
        <div className="space-y-4 lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
            <div className="relative aspect-[4/3] bg-ink-900">
              <video
                ref={videoRef}
                muted
                playsInline
                className={cn('h-full w-full object-cover', !camOn && 'opacity-0')}
              />
              {!camOn && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-ink-500">
                    <Video className="mx-auto h-7 w-7" />
                    <p className="mt-2 text-xs">
                      {faceEnabled ? 'Starting camera…' : 'Camera off'}
                    </p>
                  </div>
                </div>
              )}
              {camOn && (
                <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                  Recording
                </span>
              )}
              <span className="absolute bottom-2.5 left-2.5 truncate rounded-md bg-black/50 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
                {user?.name || 'Candidate'}
              </span>
            </div>

            {/* Verification summary. Collapses to one line when nothing is
                wrong — four "OK" rows every second is noise, not information. */}
            <div className="border-t border-ink-100 p-3">
              {!monitoringOn ? (
                <p className="text-xs text-ink-400">Verification is off for this interview.</p>
              ) : alerts.length === 0 ? (
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Verification looks good
                </p>
              ) : (
                <div className="space-y-1.5">
                  {alerts.map(([Icon, label, val, tone]) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs text-ink-600">
                        <Icon className="h-3.5 w-3.5 text-ink-400" /> {label}
                      </span>
                      <span className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold',
                        tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                      )}>
                        {val}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {monitoringOn && (
                <details className="group mt-2">
                  <summary className="cursor-pointer list-none text-[11px] font-medium text-ink-400 hover:text-ink-600">
                    <span className="group-open:hidden">Show all checks</span>
                    <span className="hidden group-open:inline">Hide checks</span>
                  </summary>
                  <div className="mt-2 space-y-1.5 border-t border-ink-100 pt-2">
                    {rows.map(([Icon, label, val, tone]) => (
                      <div key={label} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs text-ink-500">
                          <Icon className="h-3.5 w-3.5 text-ink-400" /> {label}
                        </span>
                        <Badge tone={tone}>{val}</Badge>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
          <canvas ref={canvasRef} className="hidden" />

          {/* Score of the previous answer */}
          {lastResult && (
            <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Previous answer
                </span>
                <span className="text-lg font-bold tabular-nums text-brand-600">{lastResult.score}%</span>
              </div>
              <Progress value={lastResult.score} className="mt-2" />
              {lastResult.feedback && (
                <p className="mt-3 text-xs leading-relaxed text-ink-500">{lastResult.feedback}</p>
              )}
            </div>
          )}
        </div>

        {/* Right: the question and the answer — the only things that matter */}
        <div className="min-w-0">
          <div className="flex flex-col rounded-xl border border-ink-200 bg-white shadow-sm">
            {/* Question */}
            <div className="border-b border-ink-100 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <span className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                  current?.source === 'hr' ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-600'
                )}>
                  {/* Employer-written questions are labelled so the candidate
                      knows a human chose this one, not the AI. */}
                  {current?.source === 'hr' ? 'From the employer' : 'AI interviewer'}
                </span>
                <button
                  onClick={() => speak(current?.text)}
                  title="Read the question aloud"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-500 transition hover:bg-ink-50 hover:text-ink-900"
                >
                  <Volume2 className="h-3.5 w-3.5" /> Replay
                </button>
              </div>

              <h2 className="mt-4 text-xl font-semibold leading-relaxed text-ink-900 sm:text-2xl">
                {current?.text}
              </h2>
            </div>

            <div className="p-5 sm:p-6">
            {/* Mode toggle — a segmented control rather than two loose buttons */}
            <div className="inline-flex rounded-lg border border-ink-200 bg-ink-50 p-1">
              <button
                onClick={() => setMode('voice')}
                disabled={!SpeechRecognition}
                title={SpeechRecognition ? 'Answer by speaking' : 'Voice is not supported in this browser'}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                  mode === 'voice' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
                )}
              >
                <Mic className="h-4 w-4" /> Voice
              </button>
              <button
                onClick={() => { stopRecording(); setMode('text') }}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-semibold transition',
                  mode === 'text' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
                )}
              >
                <Type className="h-4 w-4" /> Type
              </button>
            </div>

            {/* Answer area */}
            <div className="mt-4">
              {mode === 'voice' ? (
                <div className="space-y-3">
                  <div className={cn(
                    'flex items-center gap-4 rounded-xl border p-4 transition',
                    recording ? 'border-red-200 bg-red-50/50' : 'border-ink-200 bg-ink-50/50'
                  )}>
                    <button
                      onClick={recording ? stopRecording : startRecording}
                      disabled={!SpeechRecognition}
                      aria-label={recording ? 'Stop recording' : 'Start recording'}
                      className={cn(
                        'relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-40',
                        recording ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
                      )}
                    >
                      {recording && (
                        <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-50" />
                      )}
                      <span className="relative">
                        {recording ? <Square className="h-5 w-5" /> : <Mic className="h-6 w-6" />}
                      </span>
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900">
                        {!SpeechRecognition
                          ? 'Voice not supported here'
                          : recording ? 'Listening…' : 'Tap to record your answer'}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {!SpeechRecognition
                          ? 'Switch to Type to answer instead.'
                          : recording
                            ? 'Speak naturally — tap again when you are done.'
                            : 'Your speech is transcribed below, and you can edit it before submitting.'}
                      </p>
                    </div>
                  </div>
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={6}
                    disabled={recording}
                    placeholder="Your transcribed answer appears here."
                    className="input-base resize-none disabled:cursor-not-allowed disabled:bg-ink-50"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                      <AlertTriangle className="h-4 w-4 shrink-0" /> Why are you typing instead?
                    </div>
                    <Select className="mt-2" value={reason} onChange={(e) => setReason(e.target.value)}>
                      <option value="">Select a reason…</option>
                      {textReasons.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </Select>
                    <p className="mt-2 text-xs leading-relaxed text-amber-700">
                      Voice verification is skipped for this answer, and the employer sees that it was typed.
                    </p>
                  </div>
                  <textarea
                    disabled={!reason}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={7}
                    placeholder={reason ? 'Type your answer…' : 'Select a reason above first'}
                    className="input-base resize-none disabled:cursor-not-allowed disabled:bg-ink-50"
                  />
                </div>
              )}

              {error && (
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-col-reverse items-stretch gap-3 border-t border-ink-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-ink-400">
                {answer.trim()
                  ? `${answer.trim().split(/\s+/).length} words`
                  : 'An empty answer scores zero.'}
              </p>
              <Button size="lg" onClick={submit} disabled={busy} className="sm:w-auto">
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {last ? 'Finishing…' : 'Scoring & writing the next question…'}
                  </>
                ) : last ? (
                  <>Finish interview <CheckCircle2 className="h-4 w-4" /></>
                ) : (
                  <>Next question <ChevronRight className="h-4 w-4" /></>
                )}
              </Button>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FullScreen({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-ink-50/40">
      <header className="flex h-16 items-center border-b border-ink-100 bg-white px-4 sm:px-6">
        <Logo />
      </header>
      <div className="flex flex-1 items-center justify-center p-6 text-brand-600">{children}</div>
    </div>
  )
}
