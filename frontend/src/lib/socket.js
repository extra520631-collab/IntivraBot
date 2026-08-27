import { io } from 'socket.io-client'

// The socket server is the API origin without the /api suffix.
const ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '')

let socket = null

export function connectSocket(token) {
  disconnectSocket()
  // Default transports: start on HTTP long-polling, then upgrade to WebSocket.
  // This connects reliably even where a raw WS handshake is briefly unavailable.
  socket = io(ORIGIN, { auth: { token } })
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
