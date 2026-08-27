import { Server } from 'socket.io'
import { verifyToken } from '../utils/token.js'
import { corsOrigin } from './cors.js'

let io = null

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  })

  // Authenticate every socket from its JWT, then drop it into a private room
  // keyed by user id so we can push notifications to exactly one person.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) return next(new Error('No token'))
      const decoded = verifyToken(token)
      socket.userId = String(decoded.sub)
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`)
  })

  console.log('🔌 Socket.io ready')
  return io
}

// Emit an event to a single user's room (no-op if sockets aren't up).
export function emitToUser(userId, event, payload) {
  if (!io) return
  io.to(`user:${String(userId)}`).emit(event, payload)
}
