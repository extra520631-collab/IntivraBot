import { Router } from 'express'
import User from '../models/User.js'
import TeamInvite from '../models/TeamInvite.js'
import { protect, restrictTo } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'

const router = Router()

// ── Public: validate an invite code (used by the register page) ──────────────
router.get('/invite/:code', asyncHandler(async (req, res) => {
  const invite = await TeamInvite.findOne({ code: req.params.code }).lean()
  const valid = Boolean(invite) && !invite.used && new Date(invite.expiresAt) > new Date()
  res.json({
    success: true,
    valid,
    company: valid ? invite.company : null,
    role: valid ? invite.role : null,
  })
}))

// ── Everything below is HR-only ──────────────────────────────────────────────
router.use(protect, restrictTo('hr'))

// GET /api/team  — HR colleagues at the same company (the real "team")
router.get('/', asyncHandler(async (req, res) => {
  const company = req.user.company
  const filter = { role: 'hr' }
  if (company) filter.company = company
  else filter._id = req.user._id

  const users = await User.find(filter)
    .select('name email photoUrl company teamRole createdAt')
    .sort({ createdAt: 1 })
    .lean()

  const members = users.map((u) => ({
    id: u._id,
    name: u.name,
    email: u.email,
    photoUrl: u.photoUrl,
    isYou: String(u._id) === String(req.user._id),
    // Accounts created before `teamRole` existed have no value stored — fall
    // back to the old "earliest joined = Admin" heuristic for those only, so
    // this doesn't silently demote a company's existing founder.
    role: u.teamRole || (String(u._id) === String(users[0]?._id) ? 'Admin' : 'Recruiter'),
    joined: u.createdAt,
  }))

  res.json({ success: true, company: company || null, members })
}))

// GET /api/team/invites  — this company's pending (unused) invites
router.get('/invites', asyncHandler(async (req, res) => {
  if (!req.user.company) return res.json({ success: true, invites: [] })
  const invites = await TeamInvite.find({ company: req.user.company, used: false, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .lean()
  res.json({ success: true, invites })
}))

// POST /api/team/invite  — generate a shareable invite code for the HR's company
router.post('/invite', asyncHandler(async (req, res) => {
  if (!req.user.company) throw new AppError(400, 'Set your company before inviting teammates')
  const role = ['Admin', 'Recruiter', 'Viewer'].includes(req.body.role) ? req.body.role : 'Recruiter'

  const invite = await TeamInvite.create({
    code: TeamInvite.newCode(),
    company: req.user.company,
    invitedBy: req.user._id,
    role,
  })
  res.status(201).json({ success: true, invite })
}))

// DELETE /api/team/invite/:code  — revoke a pending invite
router.delete('/invite/:code', asyncHandler(async (req, res) => {
  await TeamInvite.deleteOne({ code: req.params.code, company: req.user.company, used: false })
  res.json({ success: true })
}))

export default router
