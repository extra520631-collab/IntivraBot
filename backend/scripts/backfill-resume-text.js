/**
 * One-time migration: pull the text out of every already-uploaded CV.
 *
 * Matching and the apply gate read `profile.resumeText`, which is only written
 * when a CV is uploaded. Without this, everyone who uploaded before that change
 * would be matched on their profile skills alone.
 *
 * Usage (from backend/):  node scripts/backfill-resume-text.js [--force]
 *   --force  re-extract even for users who already have resumeText
 *
 * Safe to re-run: it skips users who are already done unless --force is given.
 */
import mongoose from 'mongoose'
import { env } from '../src/config/env.js'
import User from '../src/models/User.js'
import { fetchResume } from '../src/services/resumeStore.js'
import { aiService } from '../src/services/aiService.js'

const force = process.argv.includes('--force')

await mongoose.connect(env.mongoUri)
console.log(`Connected. ${force ? 'Re-extracting all CVs.' : 'Filling in missing CV text only.'}\n`)

// Just '+profile.resumeText' — naming the parent `profile` as well would be a
// projection path collision.
const users = await User.find({ 'profile.resumeUrl': { $exists: true, $ne: '' } })
  .select('+profile.resumeText')
  .lean()

let done = 0
let skipped = 0
let failed = 0

for (const user of users) {
  const profile = user.profile || {}
  const label = `${user.email}`.padEnd(28)

  if (!force && (profile.resumeText || '').trim().length >= 30) {
    console.log(`${label} skip (already has text)`)
    skipped++
    continue
  }

  const { buffer, error, status } = await fetchResume(profile)
  if (error) {
    console.log(`${label} FAIL storage (${error}${status ? ` ${status}` : ''})`)
    failed++
    continue
  }

  const extracted = await aiService.extractResumeText(buffer, profile.resumeName || 'cv')
  const text = extracted?.text?.trim() || ''
  if (text.length < 30) {
    console.log(`${label} FAIL no readable text (${text.length} chars)`)
    failed++
    continue
  }

  const parsed = await aiService.parseResume(text)
  await User.updateOne(
    { _id: user._id },
    {
      'profile.resumeText': text,
      'profile.resumeSkills': parsed?.skills || [],
      'profile.resumeUpdatedAt': new Date(),
    }
  )
  console.log(`${label} OK ${text.length} chars, ${parsed?.skills?.length || 0} skills`)
  done++
}

console.log(`\n${done} updated · ${skipped} skipped · ${failed} failed (of ${users.length})`)
await mongoose.disconnect()
