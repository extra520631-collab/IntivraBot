import mongoose from 'mongoose'
import { env } from './env.js'

export async function connectDB() {
  mongoose.set('strictQuery', true)
  try {
    const conn = await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 10000,
    })
    console.log(`✅ MongoDB connected: ${conn.connection.host}`)
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message)
    process.exit(1)
  }

  mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB disconnected'))
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', err.message))
}
