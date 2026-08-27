import { env } from './env.js'

// Vite falls back to 5174, 5175, ... whenever the previous port is still taken,
// so in dev we accept any localhost port instead of hard-coding one.
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

export function isAllowedOrigin(origin) {
  // no origin = same-origin / curl / server-to-server
  if (!origin) return true
  if (env.clientUrls.includes(origin)) return true
  return !env.isProd && LOCALHOST.test(origin)
}

// cors() + socket.io both accept this callback form.
export function corsOrigin(origin, cb) {
  if (isAllowedOrigin(origin)) return cb(null, true)
  cb(new Error(`CORS blocked for origin: ${origin}`))
}
