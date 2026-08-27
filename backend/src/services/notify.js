import Notification from '../models/Notification.js'
import { emitToUser } from '../config/socket.js'

// Persist a notification and push it live to the recipient. Best-effort:
// notification failures must never break the action that triggered them.
export async function notify(userId, { type = 'info', title, body = '', link = '' }) {
  if (!userId || !title) return null
  try {
    const doc = await Notification.create({ user: userId, type, title, body, link })
    const unread = await Notification.countDocuments({ user: userId, read: false })
    emitToUser(userId, 'notification:new', { notification: doc.toJSON(), unread })
    return doc
  } catch (err) {
    console.warn('notify failed:', err.message)
    return null
  }
}
