import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import {
  ScanFace, Mic, Video, Type, ShieldCheck, AlertTriangle, MonitorUp,
  ChevronRight, Loader2, CheckCircle2, XCircle, Square, Smile, Sparkles,
  HelpCircle, Send, X, Clock,
} from 'lucide-react'
import Logo from '../../components/ui/Logo'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Progress from '../../components/ui/Progress'
import Spinner from '../../components/ui/Spinner'
import { Select } from '../../components/ui/Input'
import PreCheck from '../../components/interview/PreCheck'
import Transcript from '../../components/interview/Transcript'
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

// How long a candidate has to be silent before we take the answer as finished.
// Long enough to think mid-sentence, short enough that the conversation keeps
// moving — and the countdown is shown, with a way to cancel it.
const SILENCE_MS = 2500

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

  // loading | precheck | active | submitting | finishing | error
  const [phase, setPhase] = useState('loading')
  const [error, setError] = useState('')
  // The server's own wording when an interview was closed behind the
  // candidate's back — it explains which of the two things happened.
  const [closedMessage, setClosedMessage] = useState('')
  const [geminiEnabled, setGeminiEnabled] = useState(false)
  const [faceEnabled, setFaceEnabled] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [policy, setPolicy] = useState({ allowTextAnswers: true, requireScreenShare: false })
  const [camOn, setCamOn] = useState(false)
  const [live, setLive] = useState(null)
  const [liveVoice, setLiveVoice] = useState(null)
  const [frameHistory, setFrameHistory] = useState([])

  // Screen share, once the interview is running.
  const [sharing, setSharing] = useState(false)

  const [interview, setInterview] = useState(null)
  const [current, setCurrent] = useState(null) // { order, text, source }
  const [total, setTotal] = useState(5)
  // Everything said so far, in order — see Transcript.
  const [entries, setEntries] = useState([])
  const [speaking, setSpeaking] = useState(false)

  const [mode, setMode] = useState('voice') // 'voice' | 'text'
  const [reason, setReason] = useState('')
  const [answer, setAnswer] = useState('')
  const [recording, setRecording] = useState(false)
  // Milliseconds left on the "you've stopped talking" countdown, so the
  // candidate can see the send coming and cancel it.
  const [silenceLeft, setSilenceLeft] = useState(0)
  // Seconds left in the whole interview (null = untimed, e.g. practice).
  const [secondsLeft, setSecondsLeft] = useState(null)
  const [lastResult, setLastResult] = useState(null)

  // The candidate raising their hand mid-question.
  const [askOpen, setAskOpen] = useState(false)
  const [askText, setAskText] = useState('')
  const [asking, setAsking] = useState(false)
  // Set once the candidate has declared a blocker on a job that forbids typing.
  const [hardship, setHardship] = useState(false)

  const recognitionRef = useRef(null)
  const silenceRef = useRef(null)
  // Guards rec.onend: a deliberate stop (mode switch, leaving the page) must
  // not fire the answer off the way falling silent does.
  const autoSendRef = useRef(true)
  // The live transcript, readable from callbacks that closed over an older
  // render's `answer`.
  const answerRef = useRef('')
  // Same reason: speech callbacks fire seconds later and must see the current
  // phase/mode, not the ones captured when they were created.
  const phaseRef = useRef('loading')
  const modeRef = useRef('voice')
  // beginInterview is memoised with no deps, so it reads the id from here.
  const interviewIdRef = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const frameInFlightRef = useRef(false)
  const submittingRef = useRef(false)
  const streamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const shareLostAtRef = useRef(null)
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
        interviewIdRef.current = res.interview?._id
        setTotal(res.interview?.totalQuestions || 5)
        setCurrent(res.currentQuestion)
        setSecondsLeft(res.secondsLeft ?? null)
        setGeminiEnabled(Boolean(res.geminiEnabled))
        setFaceEnabled(Boolean(res.faceEnabled))
        setVoiceEnabled(Boolean(res.voiceEnabled))
        const p = res.policy || { allowTextAnswers: true, requireScreenShare: false }
        setPolicy(p)
        // Where the employer requires speech, voice is the only mode on offer.
        if (!p.allowTextAnswers) setMode('voice')
        // Seed the transcript with any conversation from a resumed run, then
        // the question that is actually waiting.
        const prior = []
        ;(res.interview?.questions || []).forEach((q) => {
          if (!q.answer) return
          prior.push({ side: 'ai', kind: 'question', text: q.text, meta: { source: q.source } })
          prior.push({ side: 'candidate', kind: 'answer', text: q.answer, meta: { score: q.score } })
        })
        if (res.currentQuestion) {
          prior.push({
            side: 'ai',
            kind: 'question',
            text: res.currentQuestion.text,
            meta: { source: res.currentQuestion.source },
          })
        }
        setEntries(prior)
        // Everything is ready — but nothing is captured until the candidate has
        // been through the pre-check and consented.
        setPhase('precheck')
      } catch (err) {
        if (!alive) return
        // 410 = the previous run was closed (left too long / out of time),
        // 409 = already taken. Both are final, and the report exists — so
        // point at it rather than showing a failure they might retry.
        if (err.status === 410 || err.status === 409) setError('closed')
        else setError(err.message || 'Could not start the interview')
        setClosedMessage(err.message || '')
        setPhase('error')
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Speak the newest interviewer line, then listen ──────────────────────────
  // The mic reopens by itself once the interviewer stops talking, so the
  // candidate never has to press anything to reply — the whole point of making
  // this a conversation rather than a form.
  const lastEntry = entries[entries.length - 1]
  useEffect(() => {
    if (phase !== 'active' || mode !== 'voice') return
    if (!lastEntry || lastEntry.side !== 'ai') return
    speak(lastEntry.text, () => {
      // Guard on the live phase, not the one captured when this ran: the
      // candidate may have switched to typing or left while it was speaking.
      if (phaseRef.current === 'active' && modeRef.current === 'voice') startRecording()
    })
    return stopSpeaking
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length, phase, mode])

  // Stop any recording / speech when leaving the page.
  useEffect(() => () => { stopRecording(); stopSpeaking() }, [])

  // Mirror the transcript into a ref: the recognition callbacks are created
  // once per recording and would otherwise read a stale `answer`.
  useEffect(() => { answerRef.current = answer }, [answer])
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { modeRef.current = mode }, [mode])

  // ── Interview clock ─────────────────────────────────────────────────────────
  // Counted down locally for display only. The server owns the real deadline,
  // so a candidate freezing this tab's clock gains nothing.
  useEffect(() => {
    // Only once the interview is actually running: the clock must not tick
    // down while they are still setting up their camera.
    if (secondsLeft == null || (phase !== 'active' && phase !== 'submitting')) return
    const t = setInterval(() => setSecondsLeft((s) => (s == null ? s : Math.max(0, s - 1))), 1000)
    return () => clearInterval(t)
  }, [secondsLeft == null, phase])

  // Out of time: submit what they have rather than letting them sit on a dead
  // page until the next request fails.
  useEffect(() => {
    if (secondsLeft !== 0 || phase !== 'active') return
    stopRecording()
    finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, phase])

  // ── Hand-off from the pre-check ─────────────────────────────────────────────
  // The pre-check already opened and verified these devices. Reusing its
  // streams avoids a second permission prompt and, for the screen share, a
  // second "pick your monitor" dialog the browser may refuse to show.
  const beginInterview = useCallback(({ cameraStream, micStream, screenStream }) => {
    if (cameraStream) {
      streamRef.current = cameraStream
      setCamOn(true)
    }
    if (micStream) audioStreamRef.current = micStream
    if (screenStream) {
      screenStreamRef.current = screenStream
      setSharing(true)
    }
    setPhase('active')
    // Start the server's clock now, not at /start — the pre-check must not eat
    // into the interview. Best-effort: a failed call leaves the clock unstarted,
    // which is generous to the candidate rather than punishing.
    if (interviewIdRef.current) {
      api.post(`/interviews/${interviewIdRef.current}/begin`)
        .then((r) => { if (r?.secondsLeft != null) setSecondsLeft(r.secondsLeft) })
        .catch(() => {})
    }
  }, [])

  // Attach the camera stream to the video element once it is on screen. The
  // element does not exist during the pre-check, so this cannot be done at
  // hand-off time.
  useEffect(() => {
    if (phase !== 'active' || !videoRef.current || !streamRef.current) return
    videoRef.current.srcObject = streamRef.current
    videoRef.current.play().catch(() => {})
  }, [phase])

  // Release the camera and screen share when leaving the page.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    screenStreamRef.current?.getTracks().forEach((t) => t.stop())
    screenStreamRef.current = null
  }, [])

  // ── Screen share: notice when it stops, and help them restore it ────────────
  useEffect(() => {
    if (phase !== 'active' || !policy.requireScreenShare) return
    const track = screenStreamRef.current?.getVideoTracks?.()[0]
    if (!track) return
    const onEnded = () => {
      shareLostAtRef.current = Date.now()
      setSharing(false)
      screenStreamRef.current = null
      reportScreen('stopped')
    }
    track.addEventListener('ended', onEnded)
    return () => track.removeEventListener('ended', onEnded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sharing, policy.requireScreenShare, interview?._id])

  async function reportScreen(type, surface = '', gapSeconds = 0) {
    if (!interview?._id || isPractice) return
    try {
      await api.post(`/interviews/${interview._id}/screen`, { type, surface, gapSeconds })
    } catch { /* best-effort: never block the interview on telemetry */ }
  }

  async function resumeShare() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' },
        audio: false,
      })
      const track = stream.getVideoTracks()[0]
      const surface = track?.getSettings?.().displaySurface
      if (surface && surface !== 'monitor') {
        stream.getTracks().forEach((t) => t.stop())
        reportScreen('wrong_surface', surface)
        setError('Please share your entire screen, not a single tab or window.')
        return
      }
      screenStreamRef.current = stream
      setSharing(true)
      setError('')
      const gap = shareLostAtRef.current
        ? Math.round((Date.now() - shareLostAtRef.current) / 1000)
        : 0
      shareLostAtRef.current = null
      reportScreen('started', surface || 'monitor', gap)
    } catch {
      setError('Screen sharing was blocked. The interview cannot continue without it.')
    }
  }

  // ── Face + emotion monitoring ───────────────────────────────────────────────
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
    // Pause while an answer is being scored, so monitoring doesn't compete
    // with it for the AI service.
    if (submittingRef.current) return
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

  // ── Audio capture for voice biometrics ──────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active' || !voiceEnabled || !audioStreamRef.current) return
    let cancelled = false
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      const ctx = new Ctx()
      if (cancelled) { ctx.close(); return }
      audioCtxRef.current = ctx
      srcSampleRateRef.current = ctx.sampleRate
      const source = ctx.createMediaStreamSource(audioStreamRef.current)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (e) => {
        if (!capturingRef.current) return
        pcmChunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)))
      }
      source.connect(processor)
      processor.connect(ctx.destination)
      processorRef.current = processor
    } catch { /* no mic / denied — voice check simply won't run */ }
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
  // only turned on while the candidate is actually recording, so the sample
  // never picks up the TTS reading the question aloud.
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
    const badFrame = live?.quality?.usable === false
    const issue = live?.quality?.issues?.[0]

    if (!faceEnabled) {
      rows.push([ScanFace, 'Face match', 'Off', 'gray'])
    } else if (live && live.baselineAvailable === false) {
      rows.push([ScanFace, 'Face match', 'No baseline photo', 'amber'])
    } else if (live?.match?.score != null) {
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

    if (faceEnabled && camOn && badFrame) {
      const label =
        issue === 'too_dark' ? 'Too dark' :
        issue === 'too_bright' ? 'Too bright' :
        issue === 'blurry' ? 'Hold still' :
        issue === 'face_too_small' ? 'Move closer' : 'Poor image'
      rows.push([Video, 'Camera', label, 'amber'])
    }

    if (live?.emotion) rows.push([Smile, 'Confidence', `${live.emotion.confidence}%`, live.emotion.confidence >= 50 ? 'green' : 'amber'])
    else rows.push([Smile, 'Confidence', faceEnabled ? (camOn ? 'Reading…' : '—') : 'Off', 'gray'])

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

    if (!voiceEnabled) rows.push([Mic, 'Voice match', 'Off', 'gray'])
    else if (liveVoice?.multiVoice) rows.push([Mic, 'Voice match', 'Multiple voices', 'red'])
    else if (liveVoice?.match?.score != null) rows.push([Mic, 'Voice match', `${liveVoice.match.score}%`, liveVoice.match.matched ? 'green' : 'red'])
    else if (liveVoice?.isReference) rows.push([Mic, 'Voice match', 'Enrolled', 'green'])
    else rows.push([Mic, 'Voice match', 'Listening…', 'gray'])

    if (policy.requireScreenShare) {
      rows.push([MonitorUp, 'Screen share', sharing ? 'Sharing' : 'Stopped', sharing ? 'green' : 'red'])
    }
    return rows
  }

  // `onDone` runs when the interviewer has finished speaking — used to open the
  // mic straight afterwards. It must also run when speech synthesis is missing
  // or throws, or the candidate would be left with a dead mic and no button.
  function speak(text, onDone) {
    const done = () => { setSpeaking(false); onDone?.() }
    if (typeof window === 'undefined' || !window.speechSynthesis || !text) {
      done()
      return
    }
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = language === 'Urdu' ? 'ur-PK' : 'en-US'
      u.onstart = () => setSpeaking(true)
      u.onend = done
      u.onerror = done
      window.speechSynthesis.speak(u)
    } catch {
      done()
    }
  }
  function stopSpeaking() {
    try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    setSpeaking(false)
  }

  // ── Voice capture via the Web Speech API ────────────────────────────────────
  //
  // There is no Submit button. A real interviewer knows you have finished
  // because you stopped talking, so that is what we listen for: once speech
  // has been silent for SILENCE_MS the answer is sent on its own. The AI then
  // decides whether it was a complete answer or needs a follow-up.
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
      const text = (finalText + interim).trimStart()
      setAnswer(text)
      // Every word heard resets the clock — the pause only counts once they
      // have actually stopped, not while they are thinking mid-sentence.
      armSilenceTimer(text)
    }
    rec.onerror = () => { capturingRef.current = false; setRecording(false); clearSilenceTimer() }
    rec.onend = () => {
      capturingRef.current = false
      setRecording(false)
      clearSilenceTimer()
      // Chrome ends recognition on its own after a long pause. If they said
      // something, that is them finished — send it rather than stranding the
      // answer in the box with no way to submit it.
      const text = answerRef.current.trim()
      if (text && !submittingRef.current && autoSendRef.current) submit()
    }
    recognitionRef.current = rec
    rec.start()
    setRecording(true)
  }

  function stopRecording() {
    clearSilenceTimer()
    // Stop the auto-send that rec.onend would otherwise trigger: this path is
    // used when the candidate switches mode or leaves the page, and neither
    // should fire off a half-spoken answer.
    autoSendRef.current = false
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    recognitionRef.current = null
    capturingRef.current = false
    setRecording(false)
    autoSendRef.current = true
  }

  function clearSilenceTimer() {
    clearTimeout(silenceRef.current)
    silenceRef.current = null
    setSilenceLeft(0)
  }

  // Wait out a pause, showing the candidate how long is left so the send never
  // feels like it happened behind their back — and give them a way to stop it.
  function armSilenceTimer(text) {
    clearTimeout(silenceRef.current)
    if (!text.trim()) return
    setSilenceLeft(SILENCE_MS)
    const startedAt = Date.now()
    const tick = () => {
      const left = SILENCE_MS - (Date.now() - startedAt)
      if (left <= 0) {
        setSilenceLeft(0)
        finishSpeaking()
        return
      }
      setSilenceLeft(left)
      silenceRef.current = setTimeout(tick, 100)
    }
    silenceRef.current = setTimeout(tick, 100)
  }

  // They stopped talking — close the mic and send what they said.
  function finishSpeaking() {
    clearSilenceTimer()
    autoSendRef.current = false
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    recognitionRef.current = null
    capturingRef.current = false
    setRecording(false)
    autoSendRef.current = true
    if (answerRef.current.trim() && !submittingRef.current) submit()
  }

  // ── The candidate asks something mid-interview ──────────────────────────────
  const sendAsk = async () => {
    const text = askText.trim()
    if (!text || asking) return
    setAsking(true)
    stopSpeaking()
    setEntries((e) => [...e, { side: 'candidate', kind: 'aside', text }])
    setAskText('')
    setAskOpen(false)
    try {
      const res = await api.post(`/interviews/${interview._id}/ask`, { text })
      setEntries((e) => [
        ...e,
        { side: 'ai', kind: 'reply', text: res.reply, meta: { intent: res.intent } },
      ])
      // A reported blocker is what unlocks typing on a job that forbids it.
      // The employer still sees it was used — see the answer's `hardship` flag.
      if (res.intent === 'issue' && !policy.allowTextAnswers) setHardship(true)
    } catch (err) {
      setEntries((e) => [
        ...e,
        {
          side: 'ai',
          kind: 'reply',
          text: err.message || "I couldn't process that just now — please carry on with your answer.",
          meta: {},
        },
      ])
    } finally {
      setAsking(false)
    }
  }

  // ── Submit the current answer ───────────────────────────────────────────────
  const submit = async () => {
    stopRecording()
    stopSpeaking()
    const text = answer.trim()
    if (!text) { setError('Please answer before continuing.'); return }
    if (mode === 'text' && !reason) { setError('Select a reason to use text mode.'); return }
    if (policy.requireScreenShare && !sharing) {
      setError('Your screen share has stopped. Restore it to continue.')
      return
    }
    setError('')
    if (mode === 'voice') sendVoiceClip() // analyse this answer's audio (non-blocking)
    submittingRef.current = true
    setPhase('submitting')

    // Show what they said straight away. If it turns out to be a question
    // rather than an answer, the entry is relabelled below.
    setEntries((e) => [...e, { side: 'candidate', kind: 'answer', text }])

    try {
      const res = await api.post(`/interviews/${interview._id}/answer`, {
        answer: text,
        mode,
        reason: mode === 'text' ? reason : undefined,
        hardship: hardship || undefined,
      })

      // Either not an answer, or an answer that isn't finished. Both leave the
      // question standing and score nothing.
      if (res.conversational) {
        setEntries((e) => {
          const next = [...e]
          const mine = next[next.length - 1]
          // A half-finished answer stays an answer in the transcript — it was
          // one, it just wasn't done. Only a genuine aside gets relabelled.
          if (mine?.side === 'candidate' && !res.followUp) mine.kind = 'aside'
          next.push({ side: 'ai', kind: 'reply', text: res.reply, meta: { intent: res.intent } })
          // A follow-up presses on what they left out, so re-reading the
          // original question would undo the point of asking it.
          if (!res.followUp) {
            next.push({
              side: 'ai',
              kind: 'question',
              text: current.text,
              meta: { source: current.source },
            })
          }
          return next
        })
        if (res.intent === 'issue' && !policy.allowTextAnswers) setHardship(true)
        // Clear the box either way: what they already said is recorded on the
        // server as a turn, and the follow-up asks for the missing part only.
        setAnswer('')
        setPhase('active')
        return
      }

      setLastResult({ score: res.score, feedback: res.feedback })
      setEntries((e) => {
        const next = [...e]
        const mine = next[next.length - 1]
        if (mine?.side === 'candidate') mine.meta = { score: res.score }
        // An aside answered alongside the answer.
        if (res.reply) next.push({ side: 'ai', kind: 'reply', text: res.reply, meta: {} })
        if (res.nextQuestion) {
          next.push({
            side: 'ai',
            kind: 'question',
            text: res.nextQuestion.text,
            meta: { source: res.nextQuestion.source },
          })
        }
        return next
      })

      if (res.done) {
        await finish()
        return
      }
      setCurrent(res.nextQuestion)
      setAnswer('')
      setReason('')
      setPhase('active')
    } catch (err) {
      // Drop the optimistic bubble — it was never recorded.
      setEntries((e) => (e[e.length - 1]?.side === 'candidate' ? e.slice(0, -1) : e))
      // The server closed the interview under us (away too long, or out of
      // time). It is already scored, so send them to the report rather than
      // leaving them retrying an answer that can no longer be accepted.
      if (err.status === 410) {
        setClosedMessage(err.message || '')
        setError('closed')
        setPhase('error')
        return
      }
      setError(err.message || 'Could not submit your answer')
      setPhase('active')
    } finally {
      submittingRef.current = false
    }
  }

  const finish = async () => {
    setPhase('finishing')
    stopSpeaking()
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
            Generating your first question.
          </p>
        </div>
      </FullScreen>
    )
  }

  if (phase === 'precheck') {
    return (
      <div className="min-h-screen bg-ink-50/40">
        <header className="flex h-16 items-center border-b border-ink-100 bg-white px-4 sm:px-6">
          <Logo />
        </header>
        <PreCheck
          requireScreenShare={policy.requireScreenShare}
          allowTextAnswers={policy.allowTextAnswers}
          totalQuestions={total}
          language={language}
          secondsLeft={secondsLeft}
          onReady={beginInterview}
          onCancel={() =>
            navigate(isPractice ? '/candidate/practice' : '/candidate/applications')
          }
        />
      </div>
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
    // Not a failure: the interview is over and scored. Saying "could not start"
    // here would send the candidate off retrying something that is finished.
    const closed = error === 'closed'
    return (
      <FullScreen>
        <div className="max-w-md text-center">
          <span
            className={cn(
              'mx-auto flex h-12 w-12 items-center justify-center rounded-full',
              closed ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
            )}
          >
            {closed ? <Clock className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
          </span>
          <h2 className="mt-4 text-lg font-semibold text-ink-900">
            {noApp ? 'No interview selected'
              : closed ? 'This interview is finished'
              : 'Could not start the interview'}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
            {noApp
              ? 'Open an application first, then start its AI interview.'
              : closed
                ? closedMessage
                : error}
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {closed && (
              <Button as={Link} to="/candidate/results">
                View my report
              </Button>
            )}
            <Button
              as={Link}
              to="/candidate/applications"
              variant={closed ? 'secondary' : 'primary'}
            >
              Go to my applications
            </Button>
          </div>
        </div>
      </FullScreen>
    )
  }

  const qNumber = current?.order || 1
  const progress = (qNumber / total) * 100
  const last = qNumber >= total
  const busy = phase === 'submitting'

  const rows = liveRows()
  const alerts = rows.filter(([, , , tone]) => tone === 'red' || tone === 'amber')
  const monitoringOn = faceEnabled || voiceEnabled || policy.requireScreenShare
  // Typing is the employer's call. A declared blocker is the way through.
  const canType = policy.allowTextAnswers || hardship
  const shareBroken = policy.requireScreenShare && !sharing
  // The pause after they stop talking, before the answer goes.
  const sending = recording && silenceLeft > 0

  return (
    <div className="flex min-h-screen flex-col bg-ink-50/40">
      <header className="sticky top-0 z-20 border-b border-ink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
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

            {/* Time left. Shown from the start rather than sprung as a warning
                near the end — a candidate pacing themselves needs to know. */}
            {secondsLeft != null && (
              <span
                title="Time left in this interview"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold tabular-nums',
                  secondsLeft <= 60 ? 'bg-red-50 text-red-700'
                    : secondsLeft <= 300 ? 'bg-amber-50 text-amber-700'
                    : 'bg-ink-50 text-ink-600'
                )}
              >
                <Clock className="h-3.5 w-3.5" />
                {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:
                {String(secondsLeft % 60).padStart(2, '0')}
              </span>
            )}

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

      {/* Screen share dropped — this blocks progress, so it sits above
          everything rather than in the sidebar where it could be missed. */}
      {shareBroken && (
        <div className="border-b border-red-200 bg-red-50">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="flex items-start gap-2 text-sm font-medium text-red-800">
              <MonitorUp className="mt-0.5 h-4 w-4 shrink-0" />
              Your screen share has stopped. This interview requires it — restore it to continue.
            </p>
            <Button size="sm" onClick={resumeShare} className="shrink-0">
              Share my screen again
            </Button>
          </div>
        </div>
      )}

      <div className="mx-auto grid w-full max-w-6xl flex-1 items-start gap-5 p-4 sm:p-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Left rail: camera, verification, last score. */}
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
                    <p className="mt-2 text-xs">Camera off</p>
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

        {/* Right: the conversation and the answer box */}
        <div className="min-w-0">
          <div className="flex flex-col rounded-xl border border-ink-200 bg-white shadow-sm">
            {/* The conversation so far. Scrolls on its own so the answer box
                never leaves the screen on a long interview. */}
            <div className="max-h-[46vh] overflow-y-auto p-5 sm:p-6">
              <Transcript entries={entries} speaking={speaking} onReplay={speak} />
            </div>

            <div className="border-t border-ink-100 p-5 sm:p-6">
              {/* Mode toggle + the Ask control, together: both are "how do I
                  say this", so they belong on the same row. */}
              <div className="flex flex-wrap items-center justify-between gap-3">
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
                    disabled={!canType}
                    title={
                      canType
                        ? 'Type your answer instead'
                        : 'This employer requires spoken answers. Use Ask to report a problem.'
                    }
                    className={cn(
                      'inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                      mode === 'text' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
                    )}
                  >
                    <Type className="h-4 w-4" /> Type
                  </button>
                </div>

                <button
                  onClick={() => setAskOpen((v) => !v)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition',
                    askOpen
                      ? 'border-brand-200 bg-brand-50 text-brand-700'
                      : 'border-ink-200 text-ink-600 hover:bg-ink-50 hover:text-ink-900'
                  )}
                >
                  {askOpen ? <X className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />}
                  {askOpen ? 'Cancel' : 'Ask a question'}
                </button>
              </div>

              {/* Ask the interviewer. Deliberately separate from the answer box:
                  a candidate should never worry that asking for a repeat will
                  be scored as their answer. */}
              {askOpen && (
                <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
                  <p className="text-xs leading-relaxed text-brand-800">
                    Ask about the role or the question, or tell the interviewer
                    something isn&apos;t working. This is never scored.
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <input
                      value={askText}
                      onChange={(e) => setAskText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendAsk()}
                      autoFocus
                      maxLength={2000}
                      placeholder="e.g. Could you repeat the question?"
                      className="input-base"
                    />
                    <Button onClick={sendAsk} disabled={!askText.trim() || asking}>
                      {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {/* Answer area */}
              <div className="mt-4">
                {mode === 'voice' ? (
                  <div className="space-y-3">
                    <div className={cn(
                      'flex items-center gap-4 rounded-xl border p-4 transition',
                      recording ? 'border-red-200 bg-red-50/50' : 'border-ink-200 bg-ink-50/50'
                    )}>
                      {/* Not a record button — the mic runs itself. This is a
                          status light, and a way back if the browser drops the
                          recogniser mid-interview. */}
                      <button
                        onClick={recording ? finishSpeaking : startRecording}
                        disabled={!SpeechRecognition || speaking || busy}
                        aria-label={recording ? "I'm done answering" : 'Start listening'}
                        title={recording ? "I'm done answering" : 'Start listening'}
                        className={cn(
                          'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-40',
                          recording ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
                        )}
                      >
                        {recording && !sending && (
                          <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-50" />
                        )}
                        {/* The countdown to sending, drawn round the mic. */}
                        {sending && (
                          <span
                            className="absolute -inset-1 rounded-full"
                            style={{
                              background: `conic-gradient(var(--tw-ring-color, #ef4444) ${
                                ((SILENCE_MS - silenceLeft) / SILENCE_MS) * 360
                              }deg, transparent 0deg)`,
                            }}
                          />
                        )}
                        <span className="relative">
                          {recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
                        </span>
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink-900">
                          {!SpeechRecognition
                            ? 'Voice not supported here'
                            : busy
                              ? 'Thinking…'
                              : speaking
                                ? 'The interviewer is speaking…'
                                : sending
                                  ? 'Sending your answer…'
                                  : recording ? 'Listening…' : 'Starting…'}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {!SpeechRecognition
                            ? canType
                              ? 'Switch to Type to answer instead.'
                              : 'Use Ask to tell the interviewer about this.'
                            : busy
                              ? 'Give them a second.'
                              : speaking
                                ? 'The mic opens as soon as they finish.'
                                : sending
                                  ? 'Pausing means you are done — keep talking to carry on.'
                                  : 'Just talk. When you stop, the interviewer replies.'}
                        </p>
                      </div>

                      {/* The pause that ends an answer, made visible. Without
                          this the send feels like it happened behind their
                          back, and a candidate pausing to think has no way
                          back. */}
                      {sending && (
                        <button
                          onClick={() => { clearSilenceTimer(); setSilenceLeft(0) }}
                          className="shrink-0 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:bg-ink-50"
                        >
                          Keep talking
                        </button>
                      )}
                    </div>

                    {/* The transcript, editable only while nothing is in
                        flight — it is a record of what was heard, not a form
                        field to fill in. */}
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      rows={3}
                      disabled={recording || busy}
                      placeholder="What you say appears here."
                      className="input-base resize-none text-sm disabled:cursor-not-allowed disabled:bg-ink-50"
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
                        {hardship && !policy.allowTextAnswers
                          ? 'This employer asked for spoken answers. You reported a problem, so typing is allowed — the employer is told this exception was used.'
                          : 'Voice verification is skipped for this answer, and the employer sees that it was typed.'}
                      </p>
                    </div>
                    <textarea
                      disabled={!reason}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      rows={6}
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
                  {answer.trim() ? `${answer.trim().split(/\s+/).length} words` : ''}
                </p>

                {/* Voice needs no button: falling silent is what ends an
                    answer. Typing has no silence to detect, so it keeps one. */}
                {mode === 'text' ? (
                  <Button
                    size="lg"
                    onClick={submit}
                    disabled={busy || shareBroken || !answer.trim()}
                    className="sm:w-auto"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {last ? 'Finishing…' : 'Thinking…'}
                      </>
                    ) : last ? (
                      <>Finish interview <CheckCircle2 className="h-4 w-4" /></>
                    ) : (
                      <>Send <ChevronRight className="h-4 w-4" /></>
                    )}
                  </Button>
                ) : (
                  <p className="flex items-center gap-2 text-xs font-medium text-ink-500">
                    {busy ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />
                        {last ? 'Wrapping up the interview…' : 'The interviewer is thinking…'}
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        {last
                          ? 'Last question — the report follows once you answer.'
                          : 'No need to submit — just speak.'}
                      </>
                    )}
                  </p>
                )}
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
