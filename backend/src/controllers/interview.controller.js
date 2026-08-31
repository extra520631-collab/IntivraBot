import mongoose from 'mongoose'
import Interview from '../models/Interview.js'
import Application from '../models/Application.js'
import User from '../models/User.js'
import Job from '../models/Job.js'
import AppError from '../utils/AppError.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { aiService } from '../services/aiService.js'
import { notify } from '../services/notify.js'
import { teamMemberIds, isTeammateOf } from '../utils/teamAccess.js'

// Small in-memory cache of baseline photos (url -> base64), so we don't
// re-download a candidate's photo from Cloudinary for every frame.
const baselineCache = new Map()
async function getBaselineB64(photoUrl) {
  if (!photoUrl) return null
  if (baselineCache.has(photoUrl)) return baselineCache.get(photoUrl)
  try {
    const res = await fetch(photoUrl)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const b64 = buf.toString('base64')
    if (baselineCache.size > 200) baselineCache.clear() // keep it bounded
    baselineCache.set(photoUrl, b64)
    return b64
  } catch {
    return null
  }
}

const FALLBACK_Q = [
  'Tell us briefly about yourself and your background.',
  'Describe a challenging project you worked on and your role in it.',
  'How do you approach learning a new technology or tool?',
  'Tell us about a time you worked in a team to solve a problem.',
  'Why are you a good fit for this role?',
]

// Used only if the AI service is unreachable (keeps the interview usable).
function fallbackScore(text = '') {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.min(100, Math.round((Math.min(words, 80) / 80) * 70) + 10)
}

// Practice topics the AI generates questions around. Kept server-side so the
// question context can't be spoofed from the client.
const PRACTICE_TOPICS = {
  'React Fundamentals': { skills: ['React', 'JSX', 'Hooks', 'Components', 'State'], questions: 6 },
  'JavaScript Deep Dive': { skills: ['JavaScript', 'Closures', 'Async/Await', 'Prototypes', 'ES6'], questions: 8 },
  'Behavioral / HR Round': { skills: ['Communication', 'Teamwork', 'Problem Solving', 'Leadership'], questions: 5 },
  'System Design Basics': { skills: ['System Design', 'Databases', 'Caching', 'APIs', 'Scalability'], questions: 6 },
  'General Practice': { skills: ['Communication', 'Problem Solving'], questions: 5 },
}

// The question/scoring prompts need a job to talk about. A practice run has
// none, so its topic stands in for one.
function jobContextFor(interview) {
  if (interview.isPractice) {
    const topic = interview.topic || 'General Practice'
    return {
      title: topic,
      skills: PRACTICE_TOPICS[topic]?.skills || PRACTICE_TOPICS['General Practice'].skills,
      passThreshold: 60,
    }
  }
  return interview.job
}

// Live status of the three AI services, shared by every /start-ish response
// path (fresh start, pre-existing resume, and the race-condition resume) so
// the frontend's live-verification UI and "Gemini live" badge never fall back
// to their default-off state just because a particular response branch forgot
// to include them — that silently turns off face/voice monitoring, not just
// the badge.
async function aiFlags() {
  const [status, faceStatus, voiceStatus] = await Promise.all([
    aiService.interviewStatus(),
    aiService.faceStatus(),
    aiService.voiceStatus(),
  ])
  return {
    geminiEnabled: Boolean(status?.geminiEnabled),
    faceEnabled: Boolean(faceStatus?.faceEnabled),
    voiceEnabled: Boolean(voiceStatus?.voiceEnabled),
  }
}

function previousQA(interview) {
  return interview.questions
    .filter((q) => q.answer)
    .map((q) => ({ question: q.text, answer: q.answer, score: q.score }))
}

// Where the employer's own questions sit in the running order: question 1 is
// always an AI warm-up, then the HR's questions verbatim, then AI questions
// fill whatever is left.
function hrQuestionAt(interview, number) {
  const list = interview.hrQuestions || []
  const idx = number - 2 // slot 2 -> first HR question
  return idx >= 0 && idx < list.length ? list[idx] : null
}

// What the AI is told about the person being interviewed, so questions land at
// their actual level instead of a generic default.
async function candidateContext(candidateId) {
  const user = await User.findById(candidateId)
    .select('profile.skills profile.resumeSkills profile.experienceYears profile.headline')
    .lean()
  const p = user?.profile || {}
  return {
    skills: [...new Set([...(p.skills || []), ...(p.resumeSkills || [])])].slice(0, 20),
    experienceYears: p.experienceYears ?? null,
    headline: p.headline || '',
  }
}

async function genQuestion(job, interview, number, candidate) {
  // An employer's question is asked exactly as written — never rephrased.
  const custom = hrQuestionAt(interview, number)
  if (custom) return { text: custom, source: 'hr' }

  const res = await aiService.interviewQuestion({
    jobTitle: job.title,
    jobSkills: job.skills,
    previousQA: previousQA(interview),
    number,
    total: interview.totalQuestions,
    language: interview.language,
    field: interview.field || job.field || '',
    candidate,
  })
  // Remember the detected field so the rest of the interview keeps one style.
  if (!interview.field && res?.field) interview.field = res.field
  // `res` is null when the AI service is unreachable or ran out of its retry
  // budget — the candidate still gets a question, but it's the generic bank,
  // not something Gemini generated. Surfaced separately so the frontend's
  // "Gemini live" badge can reflect what's actually happening per question.
  return {
    text: res?.question || FALLBACK_Q[(number - 1) % FALLBACK_Q.length],
    source: res?.question ? 'ai' : 'fallback',
  }
}

// POST /api/interviews/start
export const start = asyncHandler(async (req, res) => {
  const { applicationId, language } = req.body
  if (!mongoose.isValidObjectId(applicationId)) throw new AppError(400, 'Invalid application id')

  const application = await Application.findById(applicationId).populate('job')
  if (!application) throw new AppError(404, 'Application not found')
  if (String(application.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your application')
  const job = application.job
  if (!job) throw new AppError(404, 'Job not found for this application')

  // Resume an in-progress interview instead of starting a duplicate.
  let interview = await Interview.findOne({ application: applicationId, status: 'in_progress' })
  if (interview) {
    return res.json({
      success: true,
      resumed: true,
      interview,
      currentQuestion: interview.questions[interview.currentIndex],
      ...(await aiFlags()),
    })
  }

  // The employer's questions are snapshotted here and always fit: the
  // interview is lengthened if they don't fit in the configured count.
  const hrQuestions = (job.customQuestions || []).filter((q) => q?.trim()).slice(0, 10)
  const totalQuestions = Math.max(job.questionCount || 5, hrQuestions.length + 1)

  interview = new Interview({
    application: applicationId,
    candidate: req.user._id,
    job: job._id,
    language: language || 'English',
    totalQuestions,
    hrQuestions,
    field: job.field || '',
    currentIndex: 0,
    questions: [],
  })
  const candidate = await candidateContext(req.user._id)
  const q1 = await genQuestion(job, interview, 1, candidate)
  interview.questions.push({ order: 1, text: q1.text, source: q1.source })
  try {
    await interview.save()
  } catch (err) {
    // Another concurrent /start call for the same application won the race
    // and already created the in-progress interview (unique index above) —
    // resume that one instead of erroring.
    if (err.code === 11000) {
      const existing = await Interview.findOne({ application: applicationId, status: 'in_progress' })
      if (existing) {
        return res.json({
          success: true,
          resumed: true,
          interview: existing,
          currentQuestion: existing.questions[existing.currentIndex],
          ...(await aiFlags()),
        })
      }
    }
    throw err
  }

  res.status(201).json({
    success: true,
    interview,
    currentQuestion: interview.questions[0],
    ...(await aiFlags()),
  })
})

// POST /api/interviews/practice — start an unscored mock interview. No
// application, no job, never surfaced to HR or in the candidate's reports.
export const startPractice = asyncHandler(async (req, res) => {
  const { topic, language } = req.body
  const key = PRACTICE_TOPICS[topic] ? topic : 'General Practice'

  // One practice run at a time — resume rather than pile up abandoned ones.
  let interview = await Interview.findOne({
    candidate: req.user._id,
    isPractice: true,
    status: 'in_progress',
  })
  if (interview && interview.topic === key) {
    return res.json({
      success: true,
      resumed: true,
      interview,
      currentQuestion: interview.questions[interview.currentIndex],
      ...(await aiFlags()),
    })
  }
  // Switching topic abandons the old run.
  if (interview) await Interview.deleteOne({ _id: interview._id })

  interview = new Interview({
    isPractice: true,
    topic: key,
    candidate: req.user._id,
    language: language || 'English',
    totalQuestions: PRACTICE_TOPICS[key].questions,
    currentIndex: 0,
    questions: [],
  })
  const q1 = await genQuestion(jobContextFor(interview), interview, 1, await candidateContext(req.user._id))
  interview.questions.push({ order: 1, text: q1.text, source: q1.source })
  try {
    await interview.save()
  } catch (err) {
    // Another concurrent /practice call for this candidate won the race and
    // already created the in-progress practice interview — resume it.
    if (err.code === 11000) {
      const existing = await Interview.findOne({ candidate: req.user._id, isPractice: true, status: 'in_progress' })
      if (existing) {
        return res.json({
          success: true,
          resumed: true,
          interview: existing,
          currentQuestion: existing.questions[existing.currentIndex],
          ...(await aiFlags()),
        })
      }
    }
    throw err
  }

  res.status(201).json({
    success: true,
    interview,
    currentQuestion: interview.questions[0],
    ...(await aiFlags()),
  })
})

// POST /api/interviews/:id/voice  — analyse one answer's audio (speaker + multi-voice)
export const voice = asyncHandler(async (req, res) => {
  const { audio, sampleRate } = req.body
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')
  if (!audio) throw new AppError(400, 'No audio provided')

  const interview = await Interview.findById(req.params.id).select('+voiceRef')
  if (!interview) throw new AppError(404, 'Interview not found')
  if (String(interview.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your interview')
  if (interview.status === 'completed') throw new AppError(400, 'Interview already completed')

  // Prefer the account-level voiceprint enrolled from the Profile page: it
  // catches a stand-in on the very first answer. Fall back to this interview's
  // own first clip for candidates who never enrolled.
  const enrolled = await User.findById(interview.candidate).select('+profile.voiceRef').lean()
  const accountRef = enrolled?.profile?.voiceRef?.length ? enrolled.profile.voiceRef : null
  const ref = accountRef || (interview.voiceRef?.length ? interview.voiceRef : undefined)
  const result = await aiService.voiceAnalyze(audio, sampleRate || 16000, ref)
  if (!result?.ok) {
    return res.json({ success: true, ok: false, reason: result?.error || 'unavailable' })
  }

  const sample = {
    order: interview.currentIndex + 1,
    matchScore: result.match?.score ?? null,
    matched: result.match?.matched ?? null,
    multiVoice: Boolean(result.multiVoice),
    voiceCount: result.voiceCount ?? 1,
    duration: result.duration,
    // A clip too quiet, clipped or short to embed reliably is kept for the
    // record but never counted against the candidate - see voice._audio_quality.
    reliable: result.quality?.usable !== false,
    at: new Date(),
  }

  // The reference voiceprint is what every later answer is judged against, so
  // only a clean clip may define it. Enrolling from a noisy first answer used
  // to mis-score the whole interview.
  const enrollNow =
    !interview.voiceRef?.length && Array.isArray(result.embedding) && result.enrollable !== false

  // Atomic append, for the same reason as the frame handler: these arrive
  // alongside the candidate's answer and a full save would race it.
  await Interview.updateOne(
    { _id: interview._id },
    {
      $push: { voiceSamples: sample },
      ...(enrollNow ? { $set: { voiceRef: result.embedding } } : {}),
    }
  )

  res.json({
    success: true,
    ok: true,
    match: result.match, // null for the first (reference) clip
    multiVoice: result.multiVoice,
    voiceCount: result.voiceCount,
    isReference: result.match == null,
  })
})

// POST /api/interviews/:id/frame  — analyse one webcam frame (face + emotion)
export const frame = asyncHandler(async (req, res) => {
  const { frame: frameB64 } = req.body
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')
  if (!frameB64) throw new AppError(400, 'No frame provided')

  const interview = await Interview.findById(req.params.id)
  if (!interview) throw new AppError(404, 'Interview not found')
  if (String(interview.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your interview')
  if (interview.status === 'completed') throw new AppError(400, 'Interview already completed')

  const candidate = await User.findById(interview.candidate).select('photoUrl')
  const baseline = await getBaselineB64(candidate?.photoUrl)

  const result = await aiService.faceAnalyze(frameB64, baseline)
  if (!result?.ok) {
    return res.json({ success: true, ok: false, faceEnabled: Boolean(result) })
  }

  const sample = {
    order: interview.currentIndex + 1,
    faceCount: result.faceCount,
    singlePerson: result.singlePerson,
    confidence: result.emotion?.confidence,
    stress: result.emotion?.stress,
    label: result.emotion?.label,
    certainty: result.emotion?.certainty ?? null,
    matchScore: result.match?.score ?? null,
    matched: result.match?.matched ?? null,
    // A frame the camera could not capture properly must not later be read
    // as evidence about the candidate - see face._frame_quality.
    reliable: result.quality?.usable !== false,
    at: new Date(),
  }
  // Append atomically instead of interview.save(). Frames now arrive every few
  // seconds, so a full-document save would race the answer the candidate is
  // submitting at the same moment and one of the two would fail a version
  // check. $push touches only this array and never bumps __v.
  await Interview.updateOne(
    { _id: interview._id },
    { $push: { faceSamples: sample } }
  )

  res.json({
    success: true,
    ok: true,
    faceCount: result.faceCount,
    singlePerson: result.singlePerson,
    emotion: result.emotion,
    match: result.match,
    quality: result.quality,
    baselineAvailable: Boolean(baseline),
  })
})

// POST /api/interviews/:id/answer
export const answer = asyncHandler(async (req, res) => {
  const { answer: answerText, mode, reason } = req.body
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')

  const interview = await Interview.findById(req.params.id).populate('job')
  if (!interview) throw new AppError(404, 'Interview not found')
  if (String(interview.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your interview')
  if (interview.status === 'completed') throw new AppError(400, 'Interview already completed')

  const job = jobContextFor(interview)
  const idx = interview.currentIndex
  const q = interview.questions[idx]
  if (!q) throw new AppError(400, 'No active question to answer')

  const candidate = await candidateContext(interview.candidate)

  // Record the answer before either AI call, so the question generator can see
  // it in previousQA and ask a genuine follow-up.
  q.answer = answerText
  q.mode = mode || 'text'
  if (reason) q.reason = reason
  q.answeredAt = new Date()

  const answeredCount = idx + 1
  const done = answeredCount >= interview.totalQuestions

  // Score this answer and write the next question at the same time. They were
  // sequential, which made the candidate wait for both round-trips - about
  // 16 seconds between pressing Next and seeing anything. Neither call needs
  // the other's result: scoring reads the answer, generation reads the
  // transcript, so running them together costs the slower one alone.
  const [scored, next] = await Promise.all([
    aiService.interviewScore({
      question: q.text,
      answer: answerText,
      jobTitle: job.title,
      jobSkills: job.skills,
      language: interview.language,
      field: interview.field || job.field || '',
      candidate,
    }),
    done ? Promise.resolve(null) : genQuestion(job, interview, answeredCount + 1, candidate),
  ])

  q.score = scored?.score ?? fallbackScore(answerText)
  q.feedback = scored?.feedback || ''
  q.strengths = scored?.strengths || []
  q.improvements = scored?.improvements || []

  let nextQuestion = null
  if (next) {
    interview.currentIndex = idx + 1
    interview.questions.push({ order: answeredCount + 1, text: next.text, source: next.source })
    nextQuestion = interview.questions[interview.currentIndex]
  }

  // Write only the fields this request owns. Scoring an answer takes several
  // seconds, during which the monitoring loop appends face and voice samples;
  // a full interview.save() here would write back the stale in-memory copy
  // loaded before that and silently drop every sample captured meanwhile.
  await Interview.updateOne(
    { _id: interview._id },
    {
      $set: {
        questions: interview.questions,
        currentIndex: interview.currentIndex,
      },
    }
  )

  res.json({
    success: true,
    score: q.score,
    feedback: q.feedback,
    nextQuestion,
    done,
    progress: { answered: answeredCount, total: interview.totalQuestions },
  })
})

// POST /api/interviews/:id/finish
export const finish = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')
  const interview = await Interview.findById(req.params.id).populate('job')
  if (!interview) throw new AppError(404, 'Interview not found')
  if (String(interview.candidate) !== String(req.user._id)) throw new AppError(403, 'Not your interview')
  if (interview.status === 'completed') {
    return res.json({ success: true, interview, alreadyCompleted: true })
  }

  const job = jobContextFor(interview)
  const qa = interview.questions
    .filter((q) => q.answer)
    .map((q) => ({ question: q.text, answer: q.answer, score: q.score, strengths: q.strengths, improvements: q.improvements }))

  const summary = await aiService.interviewSummary({
    jobTitle: job.title,
    qa,
    passThreshold: job.passThreshold,
  })

  // Every question asked counts, answered or not. Averaging only the scored
  // ones let someone answer one question well and skip the rest for a high
  // mark — an unanswered question is a zero, not an absence.
  const scores = interview.questions
    .filter((q) => q.text)
    .map((q) => (q.score != null ? q.score : 0))
  // Always our own average, never the summary's. The AI summary only sees the
  // questions that were answered, so taking its number back would restore the
  // very loophole the zero-fill above closes.
  const overall = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0

  // Aggregate face + emotion samples (Phase 5).
  //
  // Frames now arrive every few seconds rather than once per question, so a
  // single bad frame is normal: someone walks past, the candidate looks away,
  // a cloud passes. Counting every one of those as a flag would fail almost
  // everybody. Two rules keep this fair:
  //   1. Unreliable frames (too dark / blurred / distant) are excluded, since
  //      they say more about the webcam than the candidate.
  //   2. What matters is how *often* something is wrong, not that it ever was.
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null)
  const allSamples = interview.faceSamples || []
  const samples = allSamples.filter((s) => s.reliable !== false)

  // Weight each emotion reading by how sure the model was about it.
  const emotionReadings = samples.filter((s) => s.confidence != null)
  const emotionScore = emotionReadings.length
    ? Math.round(
        emotionReadings.reduce((sum, s) => sum + s.confidence * ((s.certainty ?? 100) / 100), 0) /
          emotionReadings.reduce((sum, s) => sum + (s.certainty ?? 100) / 100, 0)
      )
    : null

  const faceMatchScore = avg(samples.map((s) => s.matchScore).filter((v) => v != null))

  // A flag is raised on a sustained problem, not a stray frame.
  const FLAG_RATIO = 0.25 // a quarter of the interview
  const ratio = (predicate) => {
    if (!samples.length) return 0
    return samples.filter(predicate).length / samples.length
  }
  const notAloneRatio = ratio((s) => !s.singlePerson)
  const mismatchRatio = ratio((s) => s.matched === false)

  let faceFlags = 0
  if (notAloneRatio >= FLAG_RATIO) faceFlags += 1
  if (mismatchRatio >= FLAG_RATIO) faceFlags += 1

  // Voice biometrics aggregate (Phase 6). Same reasoning as above.
  const allVoice = interview.voiceSamples || []
  const vSamples = allVoice.filter((s) => s.reliable !== false)
  const voiceMatchScore = avg(vSamples.map((s) => s.matchScore).filter((v) => v != null))
  const voiceFlags = vSamples.filter((s) => s.multiVoice || s.matched === false).length

  interview.status = 'completed'
  interview.overallScore = overall
  interview.verdict = summary?.verdict || ''
  interview.strengths = summary?.strengths || []
  interview.improvements = summary?.improvements || []
  interview.emotionScore = emotionScore
  interview.faceMatchScore = faceMatchScore
  interview.faceFlags = faceFlags
  interview.voiceMatchScore = voiceMatchScore
  interview.voiceFlags = voiceFlags
  interview.completedAt = new Date()
  await interview.save()

  // A practice run stops here: no application to update, and nothing is sent
  // to HR. The candidate still gets their score and feedback in the response.
  if (interview.isPractice) {
    return res.json({ success: true, interview, practice: true })
  }

  // Reflect the outcome on the application.
  const application = await Application.findById(interview.application)
  let totalFlags = faceFlags + voiceFlags
  if (application) {
    application.interviewScore = overall
    application.emotionScore = emotionScore
    // Flag text-mode answers plus any face/voice/identity anomalies for HR.
    const textAnswers = interview.questions.filter((q) => q.mode === 'text' && q.answer).length
    totalFlags = faceFlags + voiceFlags + textAnswers
    application.flags = totalFlags
    application.status = overall >= job.passThreshold ? 'passed' : 'rejected'
    await application.save()
  }

  // Realtime notifications: candidate gets their report, HR gets the completion.
  const cand = await User.findById(interview.candidate).select('name')
  notify(interview.candidate, {
    type: 'interview',
    title: 'Your interview report is ready',
    body: `You scored ${overall}% on ${job.title}.`,
    link: `/candidate/results?id=${interview._id}`,
  })
  notify(job.hr, {
    type: 'interview',
    title: 'Candidate completed an interview',
    body: `${cand?.name || 'A candidate'} finished ${job.title} — ${overall}%.`,
    link: `/hr/report/${interview.application}`,
  })
  if (totalFlags > 0) {
    notify(job.hr, {
      type: 'flag',
      title: 'Verification flags raised',
      body: `${cand?.name || 'A candidate'}'s interview has ${totalFlags} flag${totalFlags === 1 ? '' : 's'} to review.`,
      link: `/hr/report/${interview.application}`,
    })
  }

  res.json({ success: true, interview })
})

// GET /api/interviews/mine  — the candidate's own interview reports (newest first)
export const myInterviews = asyncHandler(async (req, res) => {
  // Practice runs are deliberately excluded — they are not real reports.
  const interviews = await Interview.find({ candidate: req.user._id, isPractice: { $ne: true } })
    .populate('job', 'title company passThreshold')
    .select('job application status overallScore emotionScore faceMatchScore voiceMatchScore faceFlags voiceFlags totalQuestions completedAt createdAt')
    .sort({ completedAt: -1, createdAt: -1 })
    .lean()

  res.json({ success: true, interviews })
})

// GET /api/interviews/hr/schedule  — interview activity across the HR team's jobs
export const hrSchedule = asyncHandler(async (req, res) => {
  const teamIds = await teamMemberIds(req.user)
  const jobs = await Job.find({ hr: { $in: teamIds } }).select('_id').lean()
  const jobIds = jobs.map((j) => j._id)

  const interviews = await Interview.find({ job: { $in: jobIds } })
    .populate('candidate', 'name')
    .populate('job', 'title')
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean()

  const list = interviews.map((iv) => ({
    id: iv._id,
    application: iv.application,
    candidate: iv.candidate?.name || 'Candidate',
    role: iv.job?.title,
    status: iv.status, // in_progress | completed
    overallScore: iv.overallScore,
    startedAt: iv.createdAt,
    completedAt: iv.completedAt,
  }))

  // Count interviews per day for the current week (Mon–Sun).
  const now = new Date()
  const monday = new Date(now)
  const dow = (now.getDay() + 6) % 7 // 0 = Monday
  monday.setDate(now.getDate() - dow)
  monday.setHours(0, 0, 0, 0)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return { date: d.getDate(), day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i], count: 0 }
  })
  interviews.forEach((iv) => {
    const t = new Date(iv.completedAt || iv.createdAt)
    const diff = Math.floor((t - monday) / 86400000)
    if (diff >= 0 && diff < 7) week[diff].count++
  })

  res.json({
    success: true,
    week,
    inProgress: list.filter((x) => x.status === 'in_progress'),
    recent: list.filter((x) => x.status === 'completed').slice(0, 8),
  })
})

// GET /api/interviews/:id  (candidate owner, or HR who owns the job)
export const getInterview = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid interview id')
  const interview = await Interview.findById(req.params.id).populate('job', 'title hr passThreshold')
  if (!interview) throw new AppError(404, 'Interview not found')

  const isOwnerCandidate = String(interview.candidate) === String(req.user._id)
  const isOwnerHr = req.user.role === 'hr' && interview.job?.hr && (await isTeammateOf(req.user, interview.job.hr))
  if (!isOwnerCandidate && !isOwnerHr) throw new AppError(403, 'Forbidden')

  res.json({ success: true, interview })
})
