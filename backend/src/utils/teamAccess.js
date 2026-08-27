// A "team" is every HR account whose `company` matches (case-insensitively).
// This governs shared access to jobs, applications and interview reports —
// same-company HR accounts act as one team, per product decision.
//
// Always resolve the *owner account's* stored `company` (fetched fresh from
// User), never a job's own `company` field: that field is free-text and
// editable by whoever created the job, so trusting it as an access boundary
// would let anyone grant themselves access to any job just by relabeling it.

import User from '../models/User.js'
import { companyRegex } from './companyMatch.js'

// Every HR user id on `user`'s team (including `user` themself). A solo HR
// with no company set only ever gets themselves.
export async function teamMemberIds(user) {
  if (!user.company?.trim()) return [user._id]
  const users = await User.find({ role: 'hr', company: { $regex: companyRegex(user.company) } })
    .select('_id')
    .lean()
  const ids = users.map((u) => u._id)
  return ids.some((id) => String(id) === String(user._id)) ? ids : [...ids, user._id]
}

// Whether `user` may access a job/application/interview owned by `ownerId` —
// true for the owner themself, or a teammate at the same company.
export async function isTeammateOf(user, ownerId) {
  if (String(ownerId) === String(user._id)) return true
  if (!user.company?.trim()) return false
  const owner = await User.findById(ownerId).select('company').lean()
  if (!owner?.company) return false
  return companyRegex(user.company).test(owner.company.trim())
}
