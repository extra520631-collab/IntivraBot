import mongoose from 'mongoose'
import Application from '../models/Application.js'
import Job, { isExpired } from '../models/Job.js'
import Interview from '../models/Interview.js'
import AppError from '../utils/AppError.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { aiService } from '../services/aiService.js'
import { notify } from '../services/notify.js'
import { candidateMatchProfile } from '../services/matching.js'
import { isTeammateOf } from '../utils/teamAccess.js'

// POST /api/applications  — candidate applies to a job
export const apply = asyncHandler(async (req, res) => {
  const { jobId, resumeUrl, resumeText, coverNote } = req.body

  if (!mongoose.isValidObjectId(jobId)) throw new AppError(400, 'Invalid job id')
  const job = await Job.findById(jobId)
  if (!job) throw new AppError(404, 'Job not found')
  if (job.status !== 'open') throw new AppError(400, 'This job is no longer accepting applications')
  if (isExpired(job)) throw new AppError(400, 'The application deadline for this job has passed')

  const already = await Application.exists({ job: jobId, candidate: req.user._id })
  if (already) throw new AppError(409, 'You have already applied to this job')

  // ATS gate. The CV stored at upload time is the source of truth — a pasted
  // resumeText only overrides it — so the gate can't be skipped by leaving the
  // field out of the request.
  const profile = await candidateMatchProfile(req.user._id)
  const cvText = (resumeText || '').trim() || profile.resumeText

  if (!cvText && !profile.profileSkills.length) {
    throw new AppError(422, 'Upload your CV on your profile before applying — it is what we score you on.', {
      needsResume: true,
    })
  }

  let atsScore = null
  let matchedSkills = []
  const result = await aiService.matchResume(cvText, job.skills, job.experience, {
    profileSkills: profile.profileSkills,
    experienceYears: profile.experienceYears,
  })

  if (result) {
    atsScore = result.score
    matchedSkills = result.matchedSkills || []
    // Enforce the job's minimum match to apply.
    if (atsScore < job.applyThreshold) {
      throw new AppError(422, `Your CV matches ${atsScore}% — this job requires at least ${job.applyThreshold}%.`, {
        atsScore,
        applyThreshold: job.applyThreshold,
        missingSkills: result.missingSkills || [],
      })
    }
  }
  // result === null means the AI service is down; the application still goes
  // through unscored rather than blocking hiring on an outage.

  const application = await Application.create({
    job: jobId,
    candidate: req.user._id,
    resumeUrl: resumeUrl || req.user.profile?.resumeUrl,
    coverNote,
    atsScore,
    matchedSkills,
    status: atsScore != null ? 'screened' : 'applied',
  })

  // Notify the HR who owns the job (realtime).
  notify(job.hr, {
    type: 'application',
    title: 'New applicant',
    body: `${req.user.name} applied to ${job.title}${atsScore != null ? ` · ATS ${atsScore}%` : ''}.`,
    link: `/hr/applications?job=${job._id}`,
  })

  res.status(201).json({ success: true, application })
})

// GET /api/applications/mine  — candidate's own applications (with job info)
export const myApplications = asyncHandler(async (req, res) => {
  const applications = await Application.find({ candidate: req.user._id })
    .sort({ createdAt: -1 })
    .populate('job', 'title company location type status')
    .lean()

  // Attach the latest interview id/status so the UI can link straight to the
  // report (or resume an interview) without a second round-trip per row.
  const interviews = await Interview.find({ application: { $in: applications.map((a) => a._id) } })
    .select('application status overallScore completedAt createdAt')
    .sort({ createdAt: -1 })
    .lean()

  const byApplication = new Map()
  for (const iv of interviews) {
    const key = String(iv.application)
    if (!byApplication.has(key)) byApplication.set(key, iv) // newest wins (sorted desc)
  }

  const withInterview = applications.map((a) => {
    const iv = byApplication.get(String(a._id))
    return {
      ...a,
      interviewId: iv?._id || null,
      interviewStatus: iv?.status || null,
    }
  })

  res.json({ success: true, applications: withInterview })
})

// GET /api/applications/job/:jobId  — HR views applicants for a job they own
export const jobApplications = asyncHandler(async (req, res) => {
  const { jobId } = req.params
  if (!mongoose.isValidObjectId(jobId)) throw new AppError(400, 'Invalid job id')

  const job = await Job.findById(jobId)
  if (!job) throw new AppError(404, 'Job not found')
  if (!(await isTeammateOf(req.user, job.hr))) {
    throw new AppError(403, 'You can only view applicants for your own team\'s jobs')
  }

  const { status } = req.query
  const filter = { job: jobId }
  if (status && status !== 'all') filter.status = status

  const applications = await Application.find(filter)
    .sort({ atsScore: -1, createdAt: -1 })
    .populate('candidate', 'name email photoUrl profile')
    .lean()

  res.json({ success: true, job: { id: job._id, title: job.title }, applications })
})

// GET /api/applications/:id  — single application + its interview
// Accessible by the HR who owns the job, or the candidate who applied.
export const getApplication = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid application id')

  const application = await Application.findById(req.params.id)
    .populate('job', 'title company location type status hr passThreshold skills')
    .populate('candidate', 'name email photoUrl profile')
    .lean()
  if (!application) throw new AppError(404, 'Application not found')

  const isOwnerHr = req.user.role === 'hr' && application.job?.hr && (await isTeammateOf(req.user, application.job.hr))
  const isOwnerCandidate = String(application.candidate?._id) === String(req.user._id)
  if (!isOwnerHr && !isOwnerCandidate) throw new AppError(403, 'Forbidden')

  // The hiring team's notes are private to them — never send them to the
  // candidate, who can legitimately fetch their own application here.
  if (!isOwnerHr) {
    delete application.hrNotes
    delete application.hrNotesUpdatedAt
  }

  // Latest interview for this application (may not exist yet).
  const interview = await Interview.findOne({ application: application._id })
    .sort({ createdAt: -1 })
    .lean()

  res.json({ success: true, application, interview: interview || null })
})

// PATCH /api/applications/:id/status  — HR updates an applicant's status
export const updateStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid application id')

  const application = await Application.findById(req.params.id).populate('job', 'hr title')
  if (!application) throw new AppError(404, 'Application not found')
  if (!(await isTeammateOf(req.user, application.job.hr))) {
    throw new AppError(403, 'You can only update applicants for your own team\'s jobs')
  }

  application.status = req.body.status
  await application.save()

  // Notify the candidate their status changed (realtime).
  notify(application.candidate, {
    type: 'status',
    title: `Application ${req.body.status}`,
    body: `Your application for ${application.job.title} is now "${req.body.status}".`,
    link: '/candidate/applications',
  })

  res.json({ success: true, application })
})

// PATCH /api/applications/:id/notes — the hiring team's private notes.
// Deliberately separate from updateStatus: saving a note must not fire a
// status-change notification at the candidate.
export const updateNotes = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid application id')

  const application = await Application.findById(req.params.id).populate('job', 'hr')
  if (!application) throw new AppError(404, 'Application not found')
  if (!(await isTeammateOf(req.user, application.job.hr))) {
    throw new AppError(403, 'You can only annotate applicants for your own team\'s jobs')
  }

  application.hrNotes = String(req.body.notes ?? '').slice(0, 4000)
  application.hrNotesUpdatedAt = new Date()
  await application.save()

  res.json({ success: true, hrNotes: application.hrNotes, hrNotesUpdatedAt: application.hrNotesUpdatedAt })
})
