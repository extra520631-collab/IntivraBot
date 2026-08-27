import http from 'http'
import { env } from './config/env.js'
import { connectDB } from './config/db.js'
import app from './app.js'
import { initSocket } from './config/socket.js'

async function start() {
  await connectDB()
  const server = http.createServer(app)
  initSocket(server) // realtime notifications
  server.listen(env.port, () =>
    console.log(`🚀 IntivraBot API running on http://localhost:${env.port} (${env.nodeEnv})`)
  )

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
