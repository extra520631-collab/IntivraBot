import { useEffect, useRef, useState } from 'react'
import {
  Camera, Mic, MonitorUp, ShieldCheck, CheckCircle2, XCircle, Loader2,
  AlertTriangle, Clock, MessageSquare, Eye, ChevronRight, Volume2, DoorOpen,
} from 'lucide-react'
import Button from '../ui/Button'
import { cn } from '../../lib/cn'

/**
 * What the candidate sees before the interview starts.
 *
 * Two jobs, and the second one matters more than it looks: it checks the
 * hardware works, and it tells the candidate exactly what is about to happen —
 * that they are being recorded, that one person must be in frame, that they can
 * interrupt and ask questions. People used to walk into the interview not
 * knowing any of that and get rattled by the first "verification" warning.
 *
 * Nothing here is a formality: an interview cannot start until every required
 * check actually passes, because a candidate discovering their mic is dead on
 * question three has already lost the interview.
 */

const CHECK_IDLE = 'idle'
const CHECK_BUSY = 'busy'
const CHECK_OK = 'ok'
const CHECK_FAIL = 'fail'

export default function PreCheck({
  requireScreenShare,
  allowTextAnswers,
  totalQuestions,
  language,
  secondsLeft,
  onReady,
  onCancel,
}) {
  const minutes = secondsLeft ? Math.round(secondsLeft / 60) : 0
  const [camera, setCamera] = useState(CHECK_IDLE)
  const [mic, setMic] = useState(CHECK_IDLE)
  const [screen, setScreen] = useState(CHECK_IDLE)
  const [micLevel, setMicLevel] = useState(0)
  const [screenError, setScreenError] = useState('')
  const [consent, setConsent] = useState(false)

  const videoRef = useRef(null)
  const camStreamRef = useRef(null)
  const micStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const rafRef = useRef(null)

  // Set once the streams have been handed to the interview, so unmounting
  // this screen doesn't stop the devices it just passed on. Without it,
  // starting the interview would immediately kill the camera, microphone and
  // screen share it had only just verified.
  const handedOffRef = useRef(false)

  // Release every device if the candidate backs out instead. Leaving them
  // running would hold the camera light on and, on some machines, stop the
  // devices being acquired again later.
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    try { audioCtxRef.current?.close() } catch { /* already closed */ }
    if (handedOffRef.current) return
    ;[camStreamRef, micStreamRef, screenStreamRef].forEach((ref) => {
      ref.current?.getTracks().forEach((t) => t.stop())
      ref.current = null
    })
  }, [])

  async function testCamera() {
    setCamera(CHECK_BUSY)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      })
      camStreamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setCamera(CHECK_OK)
    } catch {
      setCamera(CHECK_FAIL)
    }
  }

  async function testMic() {
    setMic(CHECK_BUSY)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      const Ctx = window.AudioContext || window.webkitAudioContext
      const ctx = new Ctx()
      audioCtxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      // Pass the check on hearing something, not on being handed a stream: a
      // muted or dead mic grants permission happily and returns silence.
      let heard = false
      const loop = () => {
        analyser.getByteTimeDomainData(data)
        let peak = 0
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
        const level = Math.min(100, Math.round((peak / 128) * 220))
        setMicLevel(level)
        if (level > 12) heard = true
        setMic(heard ? CHECK_OK : CHECK_BUSY)
        rafRef.current = requestAnimationFrame(loop)
      }
      loop()
    } catch {
      setMic(CHECK_FAIL)
    }
  }

  async function testScreen() {
    setScreen(CHECK_BUSY)
    setScreenError('')
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' },
        audio: false,
      })
      const track = stream.getVideoTracks()[0]
      const surface = track?.getSettings?.().displaySurface

      // The employer asked for the whole screen. A single tab or window leaves
      // everything beside it unobserved, which is the whole point of asking —
      // so this is rejected rather than quietly accepted.
      if (surface && surface !== 'monitor') {
        stream.getTracks().forEach((t) => t.stop())
        setScreen(CHECK_FAIL)
        setScreenError(
          surface === 'browser'
            ? 'You shared a single browser tab. Please share your entire screen instead.'
            : 'You shared one window. Please share your entire screen instead.'
        )
        return
      }

      screenStreamRef.current = stream
      // If they stop sharing from the browser's own bar before starting, the
      // check has to go back to failed or they'd start with no share at all.
      track?.addEventListener('ended', () => {
        screenStreamRef.current = null
        setScreen(CHECK_FAIL)
        setScreenError('Screen sharing stopped. Start it again to continue.')
      })
      setScreen(CHECK_OK)
    } catch {
      setScreen(CHECK_FAIL)
      setScreenError('Screen sharing was blocked or cancelled.')
    }
  }

  const screenReady = !requireScreenShare || screen === CHECK_OK
  const canStart = camera === CHECK_OK && mic === CHECK_OK && screenReady && consent

  const start = () => {
    // Hand the live streams to the interview rather than stopping and
    // reopening them: re-acquiring a screen share would make the candidate
    // pick their monitor a second time, and some browsers refuse without a
    // fresh user gesture.
    handedOffRef.current = true
    // The level meter's audio graph is this screen's own — the interview
    // builds its own from the same stream, so release ours before handing it
    // over rather than leaving two contexts reading one microphone.
    cancelAnimationFrame(rafRef.current)
    try { audioCtxRef.current?.close() } catch { /* already closed */ }
    audioCtxRef.current = null
    onReady({
      cameraStream: camStreamRef.current,
      micStream: micStreamRef.current,
      screenStream: screenStreamRef.current,
    })
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          <ShieldCheck className="h-3.5 w-3.5" /> Before you begin
        </span>
        <h1 className="mt-3 text-lg font-bold text-ink-900 sm:text-xl">
          Let&apos;s get you set up
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-500">
          This takes about a minute. We&apos;ll check your camera, microphone and
          screen, and show you exactly how the interview works — so nothing
          catches you out once it starts.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Device checks ───────────────────────────────────────────────── */}
        <div className="space-y-4">
          <CheckCard
            icon={Camera}
            title="Camera"
            state={camera}
            okText="Camera is working"
            failText="We couldn't access your camera. Allow it in your browser and try again."
            idleText="We watch that one person — you — is present throughout."
            onTest={testCamera}
            testLabel="Turn on camera"
          >
            <div className="relative mt-3 aspect-video overflow-hidden rounded-lg bg-ink-900">
              <video
                ref={videoRef}
                muted
                playsInline
                className={cn('h-full w-full object-cover', camera !== CHECK_OK && 'opacity-0')}
              />
              {camera !== CHECK_OK && (
                <div className="absolute inset-0 flex items-center justify-center text-ink-500">
                  <Camera className="h-8 w-8" />
                </div>
              )}
            </div>
          </CheckCard>

          <CheckCard
            icon={Mic}
            title="Microphone"
            state={mic}
            okText="We can hear you clearly"
            failText="We couldn't access your microphone. Allow it in your browser and try again."
            idleText="You'll answer out loud, so we need to be sure we can hear you."
            busyText="Say something — “hello, testing one two three”."
            onTest={testMic}
            testLabel="Test microphone"
          >
            {(mic === CHECK_BUSY || mic === CHECK_OK) && (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-75',
                      mic === CHECK_OK ? 'bg-emerald-500' : 'bg-brand-500'
                    )}
                    style={{ width: `${micLevel}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-ink-400">
                  {mic === CHECK_OK ? 'Levels look good.' : 'Waiting to hear you…'}
                </p>
              </div>
            )}
          </CheckCard>

          {requireScreenShare && (
            <CheckCard
              icon={MonitorUp}
              title="Screen share"
              state={screen}
              okText="Your entire screen is being shared"
              failText={screenError || 'Screen sharing is required for this interview.'}
              idleText="This employer requires your whole screen to be shared for the interview. Choose “Entire screen”, not a tab or window."
              onTest={testScreen}
              testLabel={screen === CHECK_FAIL ? 'Try again' : 'Share my screen'}
            />
          )}
        </div>

        {/* ── What to expect ──────────────────────────────────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-ink-900">How this interview works</h2>
            <ul className="mt-4 space-y-3.5">
              <Expect icon={MessageSquare} title="It's a conversation, not a form">
                The interviewer adapts to your answers. You can interrupt at any
                point to ask a question or say something isn&apos;t working —
                just speak, or use the <strong>Ask</strong> button.
              </Expect>
              <Expect
                icon={Clock}
                title={
                  minutes
                    ? `${totalQuestions} questions, about ${minutes} minutes`
                    : `${totalQuestions} questions, at your pace`
                }
              >
                {minutes
                  ? 'No single answer is timed — the limit is on the interview as a whole, and the clock is on screen throughout.'
                  : 'There is no timer. Take a moment to think before you speak.'}
              </Expect>

              {/* Told up front, never sprung afterwards: an interview that
                  closes itself while someone is away is only fair if they were
                  warned it would. */}
              <Expect icon={DoorOpen} title="Stay on this page">
                Leaving for more than five minutes ends the interview and submits
                what you have answered so far. A brief disconnection is fine —
                come straight back and carry on.
              </Expect>
              <Expect icon={Volume2} title={`Answer out loud in ${language}`}>
                {allowTextAnswers
                  ? 'Your speech is transcribed and you can edit it before submitting. You can switch to typing if you need to.'
                  : 'This employer has asked for spoken answers. If something genuinely stops you from speaking, tell the interviewer and it will be handled.'}
              </Expect>
              <Expect icon={Eye} title="You're being verified throughout">
                Your camera and voice are checked against your profile to confirm
                it&apos;s you. Stay alone and in frame — the report tells the
                employer if that changes.
              </Expect>
            </ul>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 bg-white p-4 shadow-sm transition hover:border-ink-300">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
            />
            <span className="text-xs leading-relaxed text-ink-600">
              I understand my camera, microphone
              {requireScreenShare ? ' and screen' : ''} will be recorded and
              analysed for this interview, and that the results are shared with
              the employer.
            </span>
          </label>

          {!canStart && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {!consent && camera === CHECK_OK && mic === CHECK_OK && screenReady
                ? 'Tick the box above to begin.'
                : 'Complete every check above before starting.'}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={start} disabled={!canStart}>
              Start interview <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CheckCard({
  icon: Icon, title, state, okText, failText, idleText, busyText,
  onTest, testLabel, children,
}) {
  const tone =
    state === CHECK_OK ? 'border-emerald-200 bg-emerald-50/40'
    : state === CHECK_FAIL ? 'border-red-200 bg-red-50/40'
    : 'border-ink-200 bg-white'

  return (
    <div className={cn('rounded-xl border p-4 shadow-sm transition sm:p-5', tone)}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            state === CHECK_OK ? 'bg-emerald-100 text-emerald-700'
            : state === CHECK_FAIL ? 'bg-red-100 text-red-700'
            : 'bg-ink-100 text-ink-500'
          )}
        >
          <Icon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-ink-900">{title}</h3>
            {state === CHECK_OK && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            {state === CHECK_FAIL && <XCircle className="h-4 w-4 text-red-600" />}
            {state === CHECK_BUSY && <Loader2 className="h-4 w-4 animate-spin text-brand-600" />}
          </div>
          <p
            className={cn(
              'mt-1 text-xs leading-relaxed',
              state === CHECK_OK ? 'text-emerald-700'
              : state === CHECK_FAIL ? 'text-red-700'
              : 'text-ink-500'
            )}
          >
            {state === CHECK_OK ? okText
              : state === CHECK_FAIL ? failText
              : state === CHECK_BUSY ? (busyText || 'Checking…')
              : idleText}
          </p>
        </div>

        {state !== CHECK_OK && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onTest}
            disabled={state === CHECK_BUSY && !busyText}
            className="shrink-0"
          >
            {testLabel}
          </Button>
        )}
      </div>
      {children}
    </div>
  )
}

function Expect({ icon: Icon, title, children }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink-900">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{children}</p>
      </div>
    </li>
  )
}
