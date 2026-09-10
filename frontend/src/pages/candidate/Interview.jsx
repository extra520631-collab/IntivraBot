import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import {
  ScanFace, Mic, Video, Type, ShieldCheck, AlertTriangle, MonitorUp,
  ChevronRight, Loader2, CheckCircle2, XCircle, Square, Smile, Sparkles,
  HelpCircle, Send, X, Clock, ShieldAlert,
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

// BCP-47 tag for speech recognition and text-to-speech.
//
// Roman Urdu maps to Urdu, not English: it is Urdu being spoken, and it is only
// the *writing* that uses Latin letters. Recognising it as en-US turns "aap ne
// kya kaam kiya" into nonsense, so the audio side must stay ur-PK even though
// the text the model reads and writes is romanised.
function speechLang(language) {
  return language === 'Urdu' || language === 'Roman Urdu' ? 'ur-PK' : 'en-US'
}

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

// ── Proctoring thresholds ───────────────────────────────────────────────────
// A violation is reported only when a problem *persists*. At one frame every
// four seconds, a single bad reading is someone walking past the door, a hand
// in front of the lens, or the detector having a bad moment — ending an
// interview on that would fail honest candidates constantly. Requiring the same
// problem across consecutive reliable frames is what makes the two-strike rule
// defensible enough to act on.
const VIOLATION_STREAK = 3 // consecutive bad frames (~12s) before it counts
// How long the candidate may be off the interview tab before it is reported.
// Long enough to dismiss a notification, short enough to catch looking
// something up.
const TAB_AWAY_MS = 8000

// ── Barge-in ────────────────────────────────────────────────────────────────
// Waveform peak (0-127 either side of centre) that counts as someone speaking
// rather than room noise. Set above typical background hum and laptop-fan
// level, below normal speech.
const BARGE_IN_LEVEL = 26
// Consecutive animation frames above that level before we believe it (~100ms).
// One spike is a cough, a door, a keyboard; a run of them is a sentence.
const BARGE_IN_FRAMES = 6

// ── Deeper proctoring cadence ───────────────────────────────────────────────
// Vision checks cost a Gemini call each, so they run far slower than the local
// face check (every 4s) — often enough to catch a phone that stays out, rare
// enough not to dominate the AI budget or the candidate's uplink.
const PROCTOR_INTERVAL_MS = 45000
// Gaze is local geometry and free, so it runs on its own faster cadence.
const GAZE_INTERVAL_MS = 6000
// How often the shared screen is captured for the employer's timeline.
const SCREENSHOT_INTERVAL_MS = 30000
// One in this many screenshots is also sent for vision analysis. Every shot is
// stored for HR to look at; analysing them all would multiply the AI cost of an
// interview several times over for very little extra catch rate.
const SCREENSHOT_ANALYZE_EVERY = 3

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
  // The employer sets the language on the job, so the server is the authority:
  // this is only the value used before /start replies, and for practice runs
  // which have no employer.
  const [language, setLanguage] = useState(location.state?.language || 'English')

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
  // Set once the candidate has declared a blocker on a job that forbids typing.
  const [hardship, setHardship] = useState(false)

  // ── Proctoring warnings ───────────────────────────────────────────────────
  // The active warning banner (strike 1), and the terminal screen (strike 2).
  const [warning, setWarning] = useState(null) // { strike, detail, message }
  const [terminated, setTerminated] = useState(null) // { detail, message }
  // Consecutive bad readings per rule, so a violation is only reported once a
  // problem has actually persisted — see VIOLATION_STREAK.
  const streaksRef = useRef({})
  // Guards against firing the same report twice while one is in flight.
  const violationInFlightRef = useRef(false)
  const terminatedRef = useRef(false)

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
  // The shared screen needs its own hidden <video>/<canvas> pair: a MediaStream
  // can only be drawn to a canvas via a video element, and the webcam already
  // occupies the one above.
  const screenVideoRef = useRef(null)
  const screenCanvasRef = useRef(null)
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
        // Whatever the employer chose on the job wins over the router state.
        if (res.interview?.language) setLanguage(res.interview.language)
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
          prior.push({
            side: 'candidate',
            kind: 'answer',
            text: q.answer,
            meta: { score: q.score, feedback: q.feedback, order: q.order },
          })
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

  // ── Barge-in: talk over the interviewer and it stops ────────────────────────
  //
  // A real interviewer stops the moment you start speaking. Without this the
  // candidate has to sit through the whole question even when they got it after
  // four words, which is the single thing that makes a spoken interview feel
  // like a recording rather than a conversation.
  //
  // Deliberately a raw level meter rather than a second SpeechRecognition: only
  // one recogniser can hold the mic at a time, and the real one is needed the
  // instant we cut the speech off. Watching the waveform costs nothing and
  // leaves the recogniser free.
  useEffect(() => {
    if (phase !== 'active' || mode !== 'voice') return
    if (!speaking || !audioStreamRef.current) return

    let raf = null
    let ctx = null
    let loud = 0
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      ctx = new Ctx()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(audioStreamRef.current).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        analyser.getByteTimeDomainData(data)
        let peak = 0
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
        // Sustained speech, not a cough or a door. A few consecutive loud
        // frames (~100ms) is a person starting a sentence; one spike is noise.
        loud = peak > BARGE_IN_LEVEL ? loud + 1 : 0
        if (loud >= BARGE_IN_FRAMES) {
          // They started talking: stop the interviewer mid-sentence and hand
          // the mic straight over, exactly as interrupting a person would.
          stopSpeaking()
          if (phaseRef.current === 'active' && modeRef.current === 'voice') startRecording()
          return
        }
        raf = requestAnimationFrame(tick)
      }
      tick()
    } catch { /* no mic / blocked — barge-in simply won't be available */ }

    return () => {
      cancelAnimationFrame(raf)
      try { ctx?.close() } catch { /* already closed */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaking, phase, mode])

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

  // Feed the shared screen into its off-screen video element so screenshots
  // can be drawn from it. Re-runs whenever the share is (re)established.
  useEffect(() => {
    if (phase !== 'active' || !sharing) return
    const el = screenVideoRef.current
    const stream = screenStreamRef.current
    if (!el || !stream) return
    el.srcObject = stream
    el.play().catch(() => {})
  }, [phase, sharing])

  // Release the camera and screen share when leaving the page.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    screenStreamRef.current?.getTracks().forEach((t) => t.stop())
    screenStreamRef.current = null
  }, [])

  // ── Report a broken rule and act on what the server decides ───────────────
  //
  // The client detects, the server judges. Strike counting lives on the server
  // precisely because this file is the thing being policed — all this does is
  // show the candidate the outcome.
  //
  // Declared ABOVE the effects that use it, not beside the other proctoring
  // helpers further down. A `const` arrow function is in its temporal dead zone
  // until its own line runs, and an effect's dependency array is evaluated
  // during render — so listing it as a dependency below its declaration threw
  // "Cannot access 'reportViolation' before initialization" and took the whole
  // page down before the interview could even load.
  const reportViolation = useCallback(async (type) => {
    if (isPractice || terminatedRef.current) return
    if (!interviewIdRef.current || violationInFlightRef.current) return
    violationInFlightRef.current = true
    try {
      const res = await api.post(`/interviews/${interviewIdRef.current}/violation`, { type })
      if (res.duplicate || res.ignored) return

      if (res.terminated) {
        terminatedRef.current = true
        // Cut everything off immediately: the interview is over, and leaving
        // the mic open would keep transcribing into a dead session.
        stopRecording()
        stopSpeaking()
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        screenStreamRef.current?.getTracks().forEach((t) => t.stop())
        screenStreamRef.current = null
        setTerminated({ detail: res.detail, message: res.message })
        setPhase('terminated')
        return
      }

      // Strike one. Spoken as well as shown — a candidate looking at their
      // notes rather than the screen is exactly the person who needs to hear
      // this, and they get only one.
      setWarning({ strike: res.strike, detail: res.detail, message: res.message })
      speak(`Warning. ${res.detail} If this happens again, your interview will end.`)
    } catch { /* never let a failed report break the interview itself */ }
    finally { violationInFlightRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPractice])

  // Apply a warning the *server* decided on. The vision checks run server-side
  // and detect their own violations, so their responses can carry a warning
  // that this page never asked for — it still has to be shown, and a
  // termination still has to end the interview here.
  const applyServerWarning = useCallback((w) => {
    if (!w || terminatedRef.current) return
    if (w.terminated) {
      terminatedRef.current = true
      stopRecording()
      stopSpeaking()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      screenStreamRef.current?.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = null
      setTerminated({ detail: w.detail, message: w.message })
      setPhase('terminated')
      return
    }
    setWarning({ strike: w.strike, detail: w.detail, message: w.message })
    speak(`Warning. ${w.detail} If this happens again, your interview will end.`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Count consecutive bad readings for one rule; report only once the problem
  // has persisted. `ok` resets the run, so an intermittent blip never adds up.
  const trackViolation = useCallback((type, bad) => {
    const streaks = streaksRef.current
    if (!bad) { streaks[type] = 0; return }
    streaks[type] = (streaks[type] || 0) + 1
    if (streaks[type] === VIOLATION_STREAK) reportViolation(type)
  }, [reportViolation])

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
      // Stopping a share the employer requires is a deliberate act — there is
      // no accidental way to do it — so it counts as a strike straight away.
      reportViolation('screen_share')
    }
    track.addEventListener('ended', onEnded)
    return () => track.removeEventListener('ended', onEnded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sharing, policy.requireScreenShare, interview?._id])

  // ── Leaving the interview tab ─────────────────────────────────────────────
  // Switching away is the cheapest way to look an answer up, and the one thing
  // the camera cannot see. Timed rather than instant: a notification stealing
  // focus for a second is not cheating, and the candidate was told the rule on
  // the terms screen before they agreed to it.
  useEffect(() => {
    if (phase !== 'active' || isPractice) return
    let awayTimer = null
    const onVisibility = () => {
      if (document.hidden) {
        awayTimer = setTimeout(() => reportViolation('tab_switch'), TAB_AWAY_MS)
      } else {
        clearTimeout(awayTimer)
        awayTimer = null
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(awayTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [phase, isPractice, reportViolation])

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

  // Grab one webcam still as a JPEG data URL, or null when there is nothing
  // usable to grab. Shared by the face check and the vision proctor so both
  // see the same picture and neither duplicates the canvas dance.
  function grabFrame(maxEdge = 640, quality = 0.8) {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) return null
    // A hidden tab freezes the video element, so the frame would be stale or
    // black — and read as "no face" by everything downstream.
    if (typeof document !== 'undefined' && document.hidden) return null

    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  }

  // Grab one still of the shared screen. Kept wider than a webcam frame
  // because the point is to read what is on it — small text at 640px is
  // illegible to a reviewer and to the vision model alike.
  function grabScreen() {
    const stream = screenStreamRef.current
    const track = stream?.getVideoTracks?.()[0]
    if (!track || track.readyState !== 'live') return null
    const video = screenVideoRef.current
    const canvas = screenCanvasRef.current
    if (!video || !canvas || !video.videoWidth) return null

    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.7)
  }

  async function captureFrame() {
    // Pause while an answer is being scored, so monitoring doesn't compete
    // with it for the AI service.
    if (submittingRef.current) return
    if (frameInFlightRef.current) return
    const dataUrl = grabFrame()
    if (!dataUrl) return
    frameInFlightRef.current = true

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

        // Judge the rules only on frames the detector could actually read. A
        // dark or blurred frame says something about the webcam, not about the
        // candidate, and must never cost them a strike — so it neither counts
        // against them nor resets a genuine streak.
        if (res.quality?.usable !== false) {
          trackViolation('multiple_faces', res.faceCount > 1)
          trackViolation('no_face', res.faceCount === 0)
          // Only when there is a baseline to compare against — no profile photo
          // means "unknown", not "impostor".
          trackViolation('face_mismatch', res.baselineAvailable && res.match?.matched === false)
        }
      }
    } catch { /* face monitoring is best-effort — never block the interview */ }
    finally { frameInFlightRef.current = false }
  }

  // ── Deeper proctoring: gaze, objects in shot, liveness ──────────────────────
  //
  // Two cadences, because the checks cost wildly different amounts. Gaze is
  // local landmark geometry and effectively free, so it samples often. Object
  // and liveness detection each cost a Gemini Vision call, so they run rarely —
  // a phone being used to look something up stays out for far longer than 45
  // seconds, so a slow cadence still catches it.
  useEffect(() => {
    if (phase !== 'active' || !camOn || !interview?._id || isPractice) return

    let stopped = false
    let gazeTimer
    let visionTimer

    const run = async (checks) => {
      if (stopped || terminatedRef.current) return
      const shot = grabFrame()
      if (!shot) return
      try {
        const res = await api.post(`/interviews/${interview._id}/proctor`, {
          frame: shot,
          checks,
        })
        if (res.warning) applyServerWarning(res.warning)
      } catch { /* proctoring is best-effort — never block the interview */ }
    }

    const gazeTick = async () => {
      await run(['gaze'])
      if (!stopped) gazeTimer = setTimeout(gazeTick, GAZE_INTERVAL_MS)
    }
    const visionTick = async () => {
      await run(['objects', 'liveness'])
      if (!stopped) visionTimer = setTimeout(visionTick, PROCTOR_INTERVAL_MS)
    }

    // Stagger the two so they never fire in the same tick and compete for the
    // canvas or the AI service.
    gazeTimer = setTimeout(gazeTick, 4000)
    visionTimer = setTimeout(visionTick, 12000)

    return () => { stopped = true; clearTimeout(gazeTimer); clearTimeout(visionTimer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn, phase, interview?._id, isPractice])

  // ── Screen capture for the employer's timeline ──────────────────────────────
  //
  // Every capture is stored so HR can scrub through what was on screen; only
  // every third is sent for analysis, because storage is cheap and vision calls
  // are not. Reuses the share the candidate already granted — no second prompt.
  useEffect(() => {
    if (phase !== 'active' || !sharing || !interview?._id || isPractice) return

    let stopped = false
    let timer
    let count = 0

    const tick = async () => {
      if (stopped || terminatedRef.current) return
      const shot = grabScreen()
      if (shot) {
        count += 1
        try {
          const res = await api.post(`/interviews/${interview._id}/screenshot`, {
            shot,
            analyze: count % SCREENSHOT_ANALYZE_EVERY === 1,
          })
          if (res.warning) applyServerWarning(res.warning)
        } catch { /* best-effort */ }
      }
      if (!stopped) timer = setTimeout(tick, SCREENSHOT_INTERVAL_MS)
    }
    // Let the first question start before the first capture — a screenshot of
    // the interview loading tells an employer nothing.
    timer = setTimeout(tick, 15000)

    return () => { stopped = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, phase, interview?._id, isPractice])

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
      if (res.ok) {
        setLiveVoice(res)
        // Unlike frames there is only one clip per answer, so there is no
        // streak to build — a clip with two people audible, or one that is
        // demonstrably not the enrolled speaker, is reported on its own. The
        // reference clip itself is never judged: it is what defines the match.
        if (!res.isReference) {
          if (res.multiVoice) reportViolation('multiple_voices')
          else if (res.match?.matched === false) reportViolation('voice_mismatch')
        }
        // The server pairs this clip against the frames captured while it was
        // recorded, so it can spot a voice with nobody in shot — something
        // neither check can see alone.
        if (res.warning) applyServerWarning(res.warning)
      }
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
      u.lang = speechLang(language)
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
    rec.lang = speechLang(language)
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

  // The old "Ask a question" box is gone: you interrupt an interviewer by
  // speaking, not by typing into a side panel. Whatever the candidate says goes
  // through /answer, which classifies it as an answer, a question or a reported
  // problem and replies accordingly — so asking is handled by the same path as
  // answering, exactly as it is with a person. The /ask endpoint remains on the
  // server for the typed-answer path.

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
        // Score *and* feedback on the bubble itself. The sidebar only ever
        // showed the most recent one, so by the end a candidate could not see
        // how any earlier answer had done — the scoring existed but was
        // invisible past the next question.
        if (mine?.side === 'candidate') {
          mine.meta = { score: res.score, feedback: res.feedback, order: current?.order }
        }
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

  // Strike two. The interview is already scored and closed on the server, so
  // this is a statement of what happened, not a screen they can retry from.
  if (phase === 'terminated') {
    return (
      <FullScreen>
        <div className="max-w-md text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
            <ShieldAlert className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-ink-900">
            Your interview has been ended
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
            {terminated?.detail}
          </p>
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-left text-xs leading-relaxed text-red-800">
            You were given one warning before this. The employer receives a report
            that states exactly which rule was broken and when, along with your
            answers up to this point.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button as={Link} to="/candidate/results">
              View my report
            </Button>
            <Button as={Link} to="/candidate/applications" variant="secondary">
              Go to my applications
            </Button>
          </div>
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

      {/* Strike one. Deliberately loud and not auto-dismissed: this is the only
          warning the candidate gets, and the next detection ends the interview.
          Dismissing is their acknowledgement, not a way to make it go away. */}
      {warning && (
        <div className="border-b-2 border-red-300 bg-red-50">
          <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3.5 sm:px-6">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-red-900">
                Warning {warning.strike} of 2 — {warning.detail}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-red-800">
                This is your only warning. If this happens again your interview
                will end automatically and the employer will be told why. Fix it
                now and carry on.
              </p>
            </div>
            <button
              onClick={() => setWarning(null)}
              className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
            >
              I understand
            </button>
          </div>
        </div>
      )}

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
          {/* Off-screen pair used only to grab stills of the shared screen. */}
          <video ref={screenVideoRef} muted playsInline className="hidden" />
          <canvas ref={screenCanvasRef} className="hidden" />

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
            <div className="max-h-[52vh] overflow-y-auto p-4 sm:p-5">
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

                {/* The Ask button is gone on purpose. Typing a question into a
                    box is not how you interrupt a person — you just say it, and
                    the interviewer works out that it was a question rather than
                    an answer. The classifier behind /answer already does exactly
                    that, so the button was making candidates do by hand
                    something the system handles on its own. */}
                {mode === 'voice' && (
                  <p className="hidden items-center gap-1.5 text-xs text-ink-400 sm:flex">
                    <HelpCircle className="h-3.5 w-3.5" />
                    Need something repeated? Just say so — it is never scored.
                  </p>
                )}
              </div>

              {/* Answer area */}
              <div className="mt-3">
                {mode === 'voice' ? (
                  <div className="space-y-2.5">
                    <div className={cn(
                      'flex items-center gap-3 rounded-xl border p-3 transition',
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
                          'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-40',
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
                          {recording ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4" />}
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
                              : 'Tell the interviewer out loud — they will handle it.'
                            : busy
                              ? 'Give them a second.'
                              : speaking
                                ? 'Start talking any time — they will stop and listen.'
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

                    {/* What was heard, shown only once there is something to
                        show. An always-visible empty box read as "type your
                        answer here", which is the opposite of what this mode
                        is — and it took up a third of the screen saying
                        nothing. It stays editable so a misheard word can be
                        corrected before the answer goes. */}
                    {answer.trim() && (
                      <div className="rounded-xl border border-ink-200 bg-white">
                        <div className="flex items-center justify-between border-b border-ink-100 px-3 py-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                            What we heard
                          </span>
                          <span className="text-[11px] text-ink-400">
                            {answer.trim().split(/\s+/).length} words
                          </span>
                        </div>
                        <textarea
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          rows={2}
                          disabled={recording || busy}
                          className="w-full resize-none border-0 bg-transparent px-3 py-2 text-sm text-ink-700 focus:outline-none disabled:cursor-not-allowed"
                        />
                      </div>
                    )}
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

              {/* Voice needs no button — falling silent is what ends an answer,
                  and its status already sits on the mic row above, so this whole
                  bar would be a second copy of it. Typing has no silence to
                  detect, so it keeps a Send button. */}
              {mode === 'text' && (
                <div className="mt-4 flex flex-col-reverse items-stretch gap-3 border-t border-ink-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-ink-400">
                    {answer.trim() ? `${answer.trim().split(/\s+/).length} words` : ''}
                  </p>
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
                </div>
              )}

              {/* The one thing worth saying in voice mode that the mic row
                  does not already say: that this is the last question. */}
              {mode === 'voice' && last && !busy && (
                <p className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-3 text-xs font-medium text-ink-500">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Last question — your report follows once you answer.
                </p>
              )}
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
