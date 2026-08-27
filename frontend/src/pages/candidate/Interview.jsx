import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import {
  ScanFace, Mic, Video, Type, ShieldCheck, AlertTriangle,
  ChevronRight, Circle, Volume2, Loader2, CheckCircle2, XCircle, Square, Smile, Sparkles,
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
  const [live, setLive] = useState(null) // { faceCount, singlePerson, emotion, match, baselineAvailable }
  const [liveVoice, setLiveVoice] = useState(null) // { match, multiVoice, isReference }

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
          video: { width: 480, height: 360 }, audio: false,
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

  // Capture one frame whenever a new question appears (camera has settled).
  useEffect(() => {
    if (phase !== 'active' || !faceEnabled || !camOn || !current || !interview?._id) return
    const t = setTimeout(() => captureFrame(), 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.order, camOn, phase])

  async function captureFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
    try {
      const res = await api.post(`/interviews/${interview._id}/frame`, { frame: dataUrl })
      if (res.ok) setLive(res)
    } catch { /* face monitoring is best-effort — never block the interview */ }
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
    // Face match vs the candidate's baseline photo
    if (!faceEnabled) rows.push([ScanFace, 'Face match', 'Off', 'gray'])
    else if (live?.match?.score != null) rows.push([ScanFace, 'Face match', `${live.match.score}%`, live.match.matched ? 'green' : 'red'])
    else if (live && live.baselineAvailable === false) rows.push([ScanFace, 'Face match', 'No baseline photo', 'amber'])
    else rows.push([ScanFace, 'Face match', camOn ? 'Checking…' : '—', 'gray'])
    // Confidence (emotion)
    if (live?.emotion) rows.push([Smile, 'Confidence', `${live.emotion.confidence}%`, live.emotion.confidence >= 50 ? 'green' : 'amber'])
    else rows.push([Smile, 'Confidence', faceEnabled ? (camOn ? 'Reading…' : '—') : 'Off', 'gray'])
    // Single person in frame
    if (live) {
      const val = live.singlePerson ? 'Confirmed' : live.faceCount === 0 ? 'No face' : `${live.faceCount} people`
      rows.push([ShieldCheck, 'Single person', val, live.singlePerson ? 'green' : 'red'])
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
        <div className="text-center">
          <Spinner size={30} />
          <p className="mt-4 text-sm font-medium text-ink-600">Preparing your interview…</p>
          <p className="text-xs text-ink-400">The AI interviewer is getting ready.</p>
        </div>
      </FullScreen>
    )
  }

  if (phase === 'finishing') {
    return (
      <FullScreen>
        <div className="text-center">
          <Spinner size={30} />
          <p className="mt-4 text-sm font-medium text-ink-600">Scoring your interview…</p>
          <p className="text-xs text-ink-400">Building your final report.</p>
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
            {noApp ? 'No interview selected' : 'Couldn’t start the interview'}
          </h2>
          <p className="mt-1 text-sm text-ink-500">
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

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Top bar */}
      <header className="flex h-16 items-center justify-between border-b border-ink-100 px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-3">
          {isPractice && (
            <Badge tone="brand">
              <Sparkles className="h-3.5 w-3.5" /> Practice · not scored
            </Badge>
          )}
          {(() => {
            // geminiEnabled reflects the service's status at interview start;
            // current?.source reflects whether *this* question actually came
            // from Gemini or the offline bank (e.g. a mid-interview outage).
            const liveNow = geminiEnabled && current?.source !== 'fallback'
            return (
              <Badge tone={liveNow ? 'green' : 'amber'}>
                <ShieldCheck className="h-3.5 w-3.5" /> {liveNow ? 'Gemini live' : 'Fallback mode'}
              </Badge>
            )
          })()}
          <span className="text-sm text-ink-500">Question {qNumber} of {total}</span>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 p-4 sm:p-6 lg:grid-cols-3">
        {/* Left: camera + monitoring (visual only) */}
        <div className="space-y-4">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-ink-900">
            <video
              ref={videoRef}
              muted
              playsInline
              className={cn('h-full w-full object-cover', !camOn && 'opacity-0')}
            />
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center text-ink-400">
                <div className="text-center">
                  <Video className="mx-auto h-8 w-8" />
                  <p className="mt-2 text-xs">
                    {faceEnabled ? 'Starting camera…' : 'Camera monitoring off'}
                  </p>
                </div>
              </div>
            )}
            {camOn && (
              <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white">
                <Circle className="h-2 w-2 fill-current" /> REC
              </span>
            )}
            <span className="absolute bottom-3 left-3 rounded-md bg-black/50 px-2 py-1 text-[11px] font-medium text-white">
              {user?.name || 'Candidate'}
            </span>
          </div>
          <canvas ref={canvasRef} className="hidden" />

          <div className="card-base p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">Live verification</div>
            <div className="space-y-3">
              {liveRows().map(([Icon, label, val, tone]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-ink-600">
                    <Icon className="h-4 w-4 text-ink-400" /> {label}
                  </span>
                  <Badge tone={tone}>{val}</Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Live score of the previous answer */}
          {lastResult && (
            <div className="card-base p-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-ink-700">Last answer score</span>
                <span className="font-semibold text-brand-600">{lastResult.score}%</span>
              </div>
              <Progress value={lastResult.score} />
              {lastResult.feedback && (
                <p className="mt-3 text-xs leading-relaxed text-ink-500">{lastResult.feedback}</p>
              )}
            </div>
          )}
        </div>

        {/* Right: question + answer */}
        <div className="lg:col-span-2">
          <div className="flex h-full flex-col card-base p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-600">
                <Volume2 className="h-4 w-4" />
                {/* Employer-written questions are labelled so the candidate
                    knows a human chose this one, not the AI. */}
                {current?.source === 'hr' ? 'Question from the employer' : 'AI Interviewer'}
              </div>
              <button
                onClick={() => speak(current?.text)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink-500 hover:bg-ink-50"
              >
                <Volume2 className="h-3.5 w-3.5" /> Replay
              </button>
            </div>
            <h2 className="mt-3 text-xl font-semibold leading-relaxed text-ink-900">
              {current?.text}
            </h2>

            {/* Mode toggle */}
            <div className="mt-6 flex items-center gap-2">
              <button
                onClick={() => setMode('voice')}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition',
                  mode === 'voice' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600'
                )}
              >
                <Mic className="h-4 w-4" /> Voice {SpeechRecognition ? '(default)' : '(not supported)'}
              </button>
              <button
                onClick={() => { stopRecording(); setMode('text') }}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition',
                  mode === 'text' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600'
                )}
              >
                <Type className="h-4 w-4" /> Text
              </button>
            </div>

            {/* Answer area */}
            <div className="mt-4 flex-1">
              {mode === 'voice' ? (
                <div className="space-y-3">
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-ink-50/50 p-6 text-center">
                    <button
                      onClick={recording ? stopRecording : startRecording}
                      disabled={!SpeechRecognition}
                      className={cn(
                        'flex h-16 w-16 items-center justify-center rounded-full text-white transition disabled:opacity-40',
                        recording ? 'bg-red-600 animate-pulse' : 'bg-brand-600 hover:bg-brand-700'
                      )}
                    >
                      {recording ? <Square className="h-6 w-6" /> : <Mic className="h-7 w-7" />}
                    </button>
                    <p className="mt-3 text-sm font-medium text-ink-700">
                      {!SpeechRecognition
                        ? 'Voice not supported in this browser — use Text mode.'
                        : recording ? 'Listening… tap to stop' : 'Tap to record your answer'}
                    </p>
                    {SpeechRecognition && (
                      <p className="text-xs text-ink-400">Your speech is transcribed live below.</p>
                    )}
                  </div>
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={4}
                    disabled={recording}
                    placeholder="Your transcribed answer appears here — stop recording to edit it before submitting."
                    className="input-base resize-none disabled:cursor-not-allowed disabled:bg-ink-50"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                      <AlertTriangle className="h-4 w-4" /> A reason is required for text mode
                    </div>
                    <Select className="mt-2" value={reason} onChange={(e) => setReason(e.target.value)}>
                      <option value="">Select a reason…</option>
                      {textReasons.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </Select>
                    <p className="mt-1.5 text-xs text-amber-700">
                      Note: voice verification is skipped for this answer and it is flagged in the HR report.
                    </p>
                  </div>
                  <textarea
                    disabled={!reason}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={5}
                    placeholder={reason ? 'Type your answer…' : 'Select a reason above first'}
                    className="input-base resize-none disabled:cursor-not-allowed disabled:bg-ink-50"
                  />
                </div>
              )}

              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-ink-100 pt-4">
              <Progress value={progress} className="mr-4 max-w-[200px]" />
              <Button onClick={submit} disabled={busy}>
                {busy ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Scoring…</>
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
  )
}

function FullScreen({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="flex h-16 items-center border-b border-ink-100 px-4 sm:px-6">
        <Logo />
      </header>
      <div className="flex flex-1 items-center justify-center p-6 text-brand-600">{children}</div>
    </div>
  )
}
