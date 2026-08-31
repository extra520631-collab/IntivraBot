import http from 'http'
import { env } from './config/env.js'
import { connectDB } from './config/db.js'
import app from './app.js'
import { initSocket } from './config/socket.js'
import { verifyMailer } from './services/mailer.js'

async function start() {
  await connectDB()
  const server = http.createServer(app)
  initSocket(server) // realtime notifications
  server.listen(env.port, () =>
    console.log(`🚀 IntivraBot API running on http://localhost:${env.port} (${env.nodeEnv})`)
  )

  // Say up front whether password-reset emails will actually go out — far
  // easier than discovering a bad App Password on a user's first reset.
  verifyMailer().then(({ ok, reason }) => {
    if (ok) console.log('📧 Email ready — password reset links will be sent.')
    else if (reason === 'not configured') {
      console.log('📧 Email not configured — reset links are returned in the API response (dev only).')
    } else {
      console.warn(`📧 Email configured but NOT working: ${reason}`)
    }
  })

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${signal} received — shutting down…`)
    server.close(() => process.exit(0))
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err)
    server.close(() => process.exit(1))
  })
}

start()
