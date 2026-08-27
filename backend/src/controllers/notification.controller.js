import mongoose from 'mongoose'
import Notification from '../models/Notification.js'
import AppError from '../utils/AppError.js'
import { asyncHandler } from '../utils/asyncHandler.js'

// GET /api/notifications  — the signed-in user's latest notifications
export const listNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()
  const unread = await Notification.countDocuments({ user: req.user._id, read: false })
  res.json({ success: true, notifications, unread })
})

// PATCH /api/notifications/read-all
export const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true })
  res.json({ success: true, unread: 0 })
})

// PATCH /api/notifications/:id/read
export const markRead = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid notification id')
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { read: true })
  const unread = await Notification.countDocuments({ user: req.user._id, read: false })
  res.json({ success: true, unread })
})
