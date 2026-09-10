import { useEffect, useRef, useState } from 'react'
import {
  Camera, Mic, MonitorUp, ShieldCheck, CheckCircle2, XCircle, Loader2,
  AlertTriangle, Clock, MessageSquare, Eye, ChevronRight, Volume2, DoorOpen,
  ShieldAlert, FileText, Users, MonitorX, Brain, Smartphone, ScanEye,
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

// ── Microphone check thresholds ─────────────────────────────────────────────
// Below this the room is effectively quiet. The check needs to see a quiet
// moment as well as a loud one, so a constant hum can never pass on its own.
const MIC_QUIET_LEVEL = 8
// Speech peaks well above room tone. Set above a fan or a hum, below a normal
// speaking voice at arm's length from the microphone.
const MIC_SPEECH_LEVEL = 28
// Frames at speech level before it counts. A bang or a cough is a single
// spike; a spoken phrase holds level across many frames (~250ms at 60fps).
const MIC_SPEECH_FRAMES = 15

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
  // The terms come first, before any device is touched. A candidate should
  // know the interview can be ended for a rule-break *before* they grant
  // camera access, not discover it in a warning banner half way through.
  const [accepted, setAccepted] = useState(false)
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

      // Pass the check on hearing *speech*, not on hearing anything: a fan, a
      // door or a cough used to satisfy this, so a candidate whose microphone
      // was picking up the room but not their voice sailed through the check
      // and discovered the problem mid-interview.
      //
      // Two conditions, both required:
      //   1. Loud enough to be a voice rather than room tone.
      //   2. Sustained across enough frames to be a word rather than a bang.
      // Speech also has to actually vary — a steady hum holds a constant level,
      // while a spoken sentence rises and falls.
      let loudFrames = 0
      let quietSeen = false
      let peakSeen = 0

      const loop = () => {
        analyser.getByteTimeDomainData(data)
        let peak = 0
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
        const level = Math.min(100, Math.round((peak / 128) * 220))
        setMicLevel(level)

        if (level < MIC_QUIET_LEVEL) quietSeen = true
        if (level >= MIC_SPEECH_LEVEL) {
          loudFrames += 1
          peakSeen = Math.max(peakSeen, level)
        }

        // Needs a quiet moment *and* a loud one: that difference is what tells
        // a voice apart from a microphone sitting next to a noisy fan.
        const heard = quietSeen && loudFrames >= MIC_SPEECH_FRAMES && peakSeen >= MIC_SPEECH_LEVEL
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

  // ── Terms and conditions ──────────────────────────────────────────────────
  if (!accepted) {
    return (
      <Terms
        minutes={minutes}
        totalQuestions={totalQuestions}
        language={language}
        requireScreenShare={requireScreenShare}
        allowTextAnswers={allowTextAnswers}
        onAccept={() => setAccepted(true)}
        onCancel={onCancel}
      />
    )
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

/**
 * The agreement the candidate reads before anything is switched on.
 *
 * This exists because the interview can now end itself. A system that ends
 * someone's interview for a rule they were never told about is not a fair
 * assessment, so every rule that can cost them is stated here, in the same
 * words the warning and the employer's report will use — including that the
 * first breach is a warning and the second is the end of the interview.
 */
function Terms({
  minutes, totalQuestions, language, requireScreenShare, allowTextAnswers,
  onAccept, onCancel,
}) {
  const [agreed, setAgreed] = useState(false)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-8 sm:px-6">
      <div className="mb-7 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          <FileText className="h-3.5 w-3.5" /> Terms of this interview
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
          Before you begin
        </h1>
        <p className="mx-auto mt-2.5 max-w-lg text-sm leading-relaxed text-ink-500">
          These are the rules your interview runs under. Nothing here is sprung
          on you later — if a rule is broken you are told at the time, in these
          same words.
        </p>
      </div>

      {/* The three facts someone actually wants before agreeing to anything.
          They were buried inside prose below; a candidate deciding whether to
          start now gets them at a glance instead of reading to find them. */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <KeyFact
          icon={MessageSquare}
          value={totalQuestions}
          label={totalQuestions === 1 ? 'question' : 'questions'}
        />
        <KeyFact
          icon={Clock}
          value={minutes || '∞'}
          label={minutes ? 'minutes total' : 'no time limit'}
        />
        <KeyFact icon={Volume2} value={language} label="spoken aloud" />
      </div>

      {/* What the interview actually is */}
      <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
        <SectionHeading n="1" title="What to expect" />
        <ul className="mt-4 space-y-4">
          <Expect icon={Clock} title={
            minutes
              ? `${totalQuestions} questions, ${minutes} minutes in total`
              : `${totalQuestions} questions, untimed`
          }>
            {minutes
              ? `The ${minutes}-minute limit covers the whole interview, not each answer, and the clock is on screen throughout. When it reaches zero your answers so far are submitted and scored.`
              : 'There is no time limit. Take a moment to think before you speak.'}
          </Expect>
          <Expect icon={Brain} title="A real conversation, driven by your answers">
            An AI interviewer listens to what you say, understands it, and
            chooses the next question from it — a vague answer gets followed up,
            a strong one moves you on. It is not a fixed list of questions.
          </Expect>
          <Expect icon={Volume2} title={`Answer out loud in ${language}`}>
            {allowTextAnswers
              ? 'Your speech is transcribed and you can correct it before it is sent. You may switch to typing if you need to, and the employer is told you did.'
              : 'This employer has asked for spoken answers. If something genuinely stops you speaking, tell the interviewer with the Ask button and it will be handled.'}
          </Expect>
          <Expect icon={MessageSquare} title="You can interrupt at any time">
            Start speaking while the interviewer is still talking and they stop
            to listen, exactly as a person would. Ask about the role, ask for a
            question to be repeated, or say something isn&apos;t working — none
            of it is ever scored against you.
          </Expect>
        </ul>
      </section>

      {/* How it is scored */}
      <section className="mt-4 rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
        <SectionHeading n="2" title="How you are scored" />
        <ul className="mt-4 space-y-4">
          <Expect icon={CheckCircle2} title="Every answer is scored as you go">
            You see the score and a line of feedback for each answer right after
            you give it. Your final result is the average across all
            {' '}{totalQuestions} questions.
          </Expect>
          <Expect icon={AlertTriangle} title="An unanswered question scores zero">
            If the interview ends early — time runs out, you leave, or a rule is
            broken — the questions you never reached still count as zero.
          </Expect>
        </ul>
      </section>

      {/* The part that can end the interview. Visually the loudest thing on
          the page: it is the only section with a consequence attached, and a
          candidate who skims everything else must still take this in. */}
      <section className="mt-4 overflow-hidden rounded-xl border-2 border-red-300 bg-white shadow-sm">
        <div className="flex items-center gap-2.5 bg-red-100 px-5 py-3 sm:px-6">
          <ShieldAlert className="h-5 w-5 shrink-0 text-red-700" />
          <h2 className="text-sm font-bold text-red-900">
            <span className="text-red-500">3.</span> Monitoring, warnings and termination
          </h2>
        </div>

        <div className="p-5 sm:p-6">
          {/* The two-strike rule as a diagram, not a sentence. This is the one
              thing on the page that costs someone their interview, and it was
              previously a clause in the middle of a paragraph. */}
          <div className="flex items-stretch gap-2.5">
            <div className="flex-1 rounded-lg border border-amber-300 bg-amber-50 p-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[11px] font-bold text-amber-900">
                  1
                </span>
                <p className="text-xs font-bold text-amber-900">First breach</p>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-amber-800">
                You get one warning, on screen and spoken aloud. Fix it and carry
                on — nothing is lost.
              </p>
            </div>
            <div className="flex-1 rounded-lg border border-red-300 bg-red-50 p-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-200 text-[11px] font-bold text-red-900">
                  2
                </span>
                <p className="text-xs font-bold text-red-900">Second breach</p>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-red-800">
                Your interview ends immediately. The employer is told the exact
                rule and when it happened.
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-red-900/60">
            What counts as a breach
          </p>

          <ul className="mt-3 space-y-4">
          <Expect icon={Users} title="Stay alone and in frame" tone="red">
            Another person visible on camera, or you leaving the camera&apos;s
            view, is a violation. So is another voice answering, or a voice that
            does not match your enrolled one.
          </Expect>
          <Expect icon={Eye} title="It must be you, live" tone="red">
            Your face and voice are matched against your profile, and the camera
            is checked for a photo, a screen or a synthetic face held up in place
            of a real one. Someone else sitting the interview for you — in person
            or by feeding you answers off camera — ends it.
          </Expect>
          <Expect icon={MonitorX} title="Stay on this page" tone="red">
            Switching to another tab or window for more than a few seconds is a
            violation — that is where an answer would be looked up.
            {requireScreenShare
              ? ' Your whole screen is shared for this interview, and stopping the share is also a violation.'
              : ''}
          </Expect>
          <Expect icon={Smartphone} title="No phone, notes or second screen" tone="red">
            Your camera is checked for a phone or tablet, handwritten or printed
            notes, an open book, and any second monitor in view. A mug, a
            keyboard, headphones and your own interview laptop are all fine.
          </Expect>
          <Expect icon={ScanEye} title="Look at the screen" tone="red">
            Spending most of the interview looking away — off to one side or
            down at something — is treated as reading from an off-camera source.
            Glancing away to think is normal and is not counted.
          </Expect>
          {requireScreenShare && (
            <Expect icon={Camera} title="Your screen is captured periodically" tone="red">
              A snapshot of your shared screen is saved every half-minute and
              sent to the employer with your report. An AI assistant, search
              results, prepared notes or a chat app on screen is a violation.
            </Expect>
          )}
          <Expect icon={DoorOpen} title="Leaving for five minutes ends it" tone="red">
            A brief disconnection is fine — come straight back. Being gone longer
            than five minutes submits what you have answered so far.
          </Expect>
          </ul>

          {/* Reassurance belongs *inside* the scary section, not after it —
              someone who has just read seven ways to fail needs to know the
              system is not looking for excuses. */}
          <div className="mt-5 flex gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <p className="text-xs leading-relaxed text-emerald-900">
              <strong className="font-semibold">You will not be caught out by a glitch.</strong>{' '}
              A single bad camera frame never counts. A rule is only recorded once
              the problem genuinely persists, and a frame too dark or blurred to
              read is discarded rather than held against you.
            </p>
          </div>
        </div>
      </section>

      <label
        className={cn(
          'mt-4 flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 shadow-sm transition',
          agreed
            ? 'border-brand-300 bg-brand-50/60'
            : 'border-ink-200 bg-white hover:border-ink-300'
        )}
      >
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
        />
        <span className="text-xs leading-relaxed text-ink-600">
          I have read and accept these terms. I understand my camera, microphone
          {requireScreenShare ? ' and screen' : ''} will be recorded and analysed
          {requireScreenShare ? ', that snapshots of my shared screen will be saved and sent to the employer' : ''},
          that the results are shared with the employer, and that a second rule
          violation will end my interview.
        </span>
      </label>

      {/* Pinned to the bottom of the viewport. The page is long enough that
          both the checkbox and the button used to sit below the fold, so a
          candidate who had finished reading had to scroll back to find out how
          to proceed — and had no visible indication of what was blocking them. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col-reverse gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-6">
          <Button variant="secondary" onClick={onCancel} className="sm:w-auto">
            Not now
          </Button>
          <div className="flex-1" />
          {!agreed && (
            <p className="text-center text-xs text-ink-400 sm:text-right">
              Tick the box above to continue
            </p>
          )}
          <Button size="lg" onClick={onAccept} disabled={!agreed}>
            I agree — continue <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// The headline numbers, pulled out of the prose so they are readable in one
// glance. These are what someone checks before committing their next 20
// minutes, and they should never require reading a paragraph to find.
function KeyFact({ icon: Icon, value, label }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3.5 text-center shadow-sm">
      <Icon className="mx-auto h-4 w-4 text-brand-600" />
      <p className="mt-1.5 text-xl font-bold leading-none tracking-tight text-ink-900">
        {value}
      </p>
      <p className="mt-1 text-[11px] font-medium text-ink-400">{label}</p>
    </div>
  )
}

// Numbered section title. The number sits in the brand colour so the three
// sections read as a sequence to work through rather than three loose cards.
function SectionHeading({ n, title }) {
  return (
    <h2 className="flex items-baseline gap-2 text-sm font-bold text-ink-900">
      <span className="text-brand-600">{n}.</span> {title}
    </h2>
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

function Expect({ icon: Icon, title, children, tone }) {
  const red = tone === 'red'
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
          red ? 'bg-red-100 text-red-700' : 'bg-brand-50 text-brand-600'
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className={cn('text-xs font-semibold', red ? 'text-red-900' : 'text-ink-900')}>
          {title}
        </p>
        <p className={cn('mt-0.5 text-xs leading-relaxed', red ? 'text-red-800' : 'text-ink-500')}>
          {children}
        </p>
      </div>
    </li>
  )
}
