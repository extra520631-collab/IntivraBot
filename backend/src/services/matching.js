import User from '../models/User.js'
import { isAccepting, isExpired } from '../models/Job.js'
import { aiService } from './aiService.js'

// Candidate-side ATS matching, shared by the job board, the job detail page and
// the apply gate so all three agree on a candidate's score for a job.

// The CV text and profile skills a candidate is matched on. resumeText is
// select:false, hence the explicit '+'.
export async function candidateMatchProfile(userId) {
  const user = await User.findById(userId)
    .select('+profile.resumeText profile.skills profile.resumeSkills profile.experienceYears')
    .lean()

  const p = user?.profile || {}
  const resumeText = (p.resumeText || '').trim()
  return {
    resumeText,
    // The CV rarely lists everything; the ticked profile skills fill the gaps.
    profileSkills: [...new Set([...(p.skills || []), ...(p.resumeSkills || [])])],
    experienceYears: p.experienceYears ?? null,
    hasResume: resumeText.length >= 30,
  }
}

// Score a page of jobs for one candidate in a single AI-service call.
// Returns a Map of jobId -> { score, matchedSkills, missingSkills }.
// An empty Map means "could not score" (AI service down, or nothing to match
// on) — callers must treat that as unknown, never as a zero.
export async function scoreJobsForCandidate(matchProfile, jobs) {
  const scores = new Map()
  if (!jobs.length) return scores
  if (!matchProfile.resumeText && !matchProfile.profileSkills.length) return scores

  const res = await aiService.matchResumeBatch(
    matchProfile.resumeText,
    jobs.map((j) => ({ id: String(j._id), skills: j.skills || [], experience: j.experience || '' })),
    { profileSkills: matchProfile.profileSkills, experienceYears: matchProfile.experienceYears }
  )
  for (const r of res?.results || []) scores.set(r.id, r)
  return scores
}

// Decorate jobs with the candidate's match. `eligible` is what the apply gate
// enforces; it stays true when we could not score, so an AI-service outage
// never silently locks everyone out of applying. A closed or past-deadline job
// is never eligible regardless of score — the server rejects those anyway, so
// showing an enabled Apply button would only be a dead end.
export function attachMatch(jobs, scores) {
  return jobs.map((job) => {
    const open = isAccepting(job)
    const m = scores.get(String(job._id))
    if (!m) return { ...job, matchScore: null, eligible: open, isExpired: isExpired(job) }
    return {
      ...job,
      matchScore: m.score,
      matchedSkills: m.matchedSkills,
      missingSkills: m.missingSkills,
      eligible: open && m.score >= (job.applyThreshold ?? 0),
      isExpired: isExpired(job),
    }
  })
}
