import Application from '../models/Application.js'
import Job from '../models/Job.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { teamMemberIds } from '../utils/teamAccess.js'

const round = (n) => Math.round(n)
const avg = (arr) => (arr.length ? round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0)

// Last 6 calendar months as { key, m } buckets (oldest first).
function lastSixMonths() {
  const now = new Date()
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, m: d.toLocaleString('en-US', { month: 'short' }), v: 0 })
  }
  return months
}

function bucketByMonth(items) {
  const months = lastSixMonths()
  const idx = Object.fromEntries(months.map((mm, i) => [mm.key, i]))
  for (const it of items) {
    const d = new Date(it.createdAt)
    const k = `${d.getFullYear()}-${d.getMonth()}`
    if (k in idx) months[idx[k]].v++
  }
  return months.map(({ m, v }) => ({ m, v }))
}

// GET /api/analytics/hr  — recruitment overview across the HR team's jobs
export const hrAnalytics = asyncHandler(async (req, res) => {
  const teamIds = await teamMemberIds(req.user)
  const jobs = await Job.find({ hr: { $in: teamIds } }).select('_id title status').lean()
  const jobIds = jobs.map((j) => j._id)

  const apps = await Application.find({ job: { $in: jobIds } })
    .populate('candidate', 'name email')
    .populate('job', 'title')
    .sort({ createdAt: -1 })
    .lean()

  const total = apps.length
  const statuses = ['applied', 'screened', 'shortlisted', 'interviewed', 'passed', 'rejected']
  const byStatus = Object.fromEntries(statuses.map((s) => [s, 0]))
  apps.forEach((a) => { if (a.status in byStatus) byStatus[a.status]++ })

  const eligible = apps.filter((a) => a.atsScore != null).length
  const interviewed = apps.filter((a) => a.interviewScore != null).length
  const passed = byStatus.passed
  const rejected = byStatus.rejected

  const funnel = [
    { stage: 'Applied', value: total },
    { stage: 'Screened', value: eligible },
    { stage: 'Interviewed', value: interviewed },
    { stage: 'Passed', value: passed },
  ]

  const buckets = { '0-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 }
  apps.forEach((a) => {
    if (a.atsScore == null) return
    const s = a.atsScore
    if (s <= 40) buckets['0-40']++
    else if (s <= 60) buckets['41-60']++
    else if (s <= 80) buckets['61-80']++
    else buckets['81-100']++
  })
  const scoreDistribution = Object.entries(buckets).map(([range, v]) => ({ range, v }))

  const outcome = [
    { name: 'Passed', value: passed },
    { name: 'Not passed', value: rejected },
    { name: 'In review', value: total - passed - rejected },
  ]

  const skillCount = {}
  apps.forEach((a) => (a.matchedSkills || []).forEach((s) => { skillCount[s] = (skillCount[s] || 0) + 1 }))
  const topSkills = Object.entries(skillCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([skill, count]) => ({ skill, pct: total ? round((count / total) * 100) : 0 }))

  const avgMatchScore = avg(apps.map((a) => a.atsScore).filter((s) => s != null))
  const avgInterviewScore = avg(apps.map((a) => a.interviewScore).filter((s) => s != null))
  const passRate = passed + rejected > 0 ? round((passed / (passed + rejected)) * 100) : 0

  const flagged = apps
    .filter((a) => (a.flags || 0) > 0)
    .slice(0, 6)
    .map((a) => ({ id: a._id, name: a.candidate?.name || 'Candidate', role: a.job?.title, flags: a.flags }))

  const recent = apps.slice(0, 5).map((a) => ({
    id: a._id,
    name: a.candidate?.name || 'Candidate',
    role: a.job?.title,
    interviewScore: a.interviewScore,
    atsScore: a.atsScore,
    status: a.status,
  }))

  res.json({
    success: true,
    stats: { total, eligible, interviewed, passed, avgMatchScore, avgInterviewScore, passRate, activeJobs: jobs.filter((j) => j.status === 'open').length },
    funnel,
    scoreDistribution,
    outcome,
    topSkills,
    applicationsTrend: bucketByMonth(apps),
    flagged,
    recent,
  })
})

// GET /api/analytics/candidate  — the signed-in candidate's own overview
export const candidateAnalytics = asyncHandler(async (req, res) => {
  const apps = await Application.find({ candidate: req.user._id })
    .populate('job', 'title company')
    .sort({ createdAt: -1 })
    .lean()

  const applications = apps.length
  const interviewsDone = apps.filter((a) => a.interviewScore != null).length
  const shortlisted = apps.filter((a) => a.status === 'shortlisted').length
  const passed = apps.filter((a) => a.status === 'passed').length

  const recent = apps.slice(0, 5).map((a) => ({
    id: a._id,
    job: a.job?.title,
    company: a.job?.company,
    score: a.interviewScore ?? a.atsScore,
    status: a.status,
    date: a.createdAt,
  }))

  const u = req.user
  const checks = {
    photo: Boolean(u.photoUrl),
    resume: Boolean(u.profile?.resumeUrl),
    skills: (u.profile?.skills || []).length > 0,
    headline: Boolean(u.profile?.headline),
  }
  const doneCount = Object.values(checks).filter(Boolean).length
  const profileCompletion = round((doneCount / 4) * 100)

  res.json({
    success: true,
    stats: { applications, interviewsDone, shortlisted, passed },
    recent,
    profile: { completion: profileCompletion, checks },
  })
})
