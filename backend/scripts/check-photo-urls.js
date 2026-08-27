/**
 * Find profile photos that no longer exist in storage.
 *
 * photoUrl is the baseline the interview's face-match compares live webcam
 * frames against. If the image 404s, face verification silently has nothing to
 * match on — and the UI renders a broken avatar. This reports every dead link
 * and, with --fix, clears it so the account correctly reads as "no baseline"
 * and prompts the user to re-take their photo.
 *
 * Usage (from backend/):  node scripts/check-photo-urls.js [--fix]
 */
import mongoose from 'mongoose'
import { env } from '../src/config/env.js'
import User from '../src/models/User.js'

const fix = process.argv.includes('--fix')

await mongoose.connect(env.mongoUri)
const users = await User.find({ photoUrl: { $exists: true, $ne: '' } })
  .select('name email photoUrl')
  .lean()

console.log(`Checking ${users.length} profile photos${fix ? ' (dead links will be cleared)' : ''}\n`)

let ok = 0
const dead = []
for (const u of users) {
  let status
  try {
    // HEAD is enough and avoids pulling the image bytes.
    status = (await fetch(u.photoUrl, { method: 'HEAD' })).status
  } catch {
    status = 0
  }
  if (status === 200) {
    ok++
    console.log(`${u.email.padEnd(28)} ok`)
  } else {
    dead.push(u)
    console.log(`${u.email.padEnd(28)} DEAD (${status || 'unreachable'})`)
  }
}

if (fix && dead.length) {
  await User.updateMany({ _id: { $in: dead.map((u) => u._id) } }, { $unset: { photoUrl: '' } })
  console.log(`\nCleared ${dead.length} dead photo link(s) — those users should re-take their photo.`)
} else if (dead.length) {
  console.log(`\n${dead.length} dead link(s). Re-run with --fix to clear them.`)
}

console.log(`\n${ok} ok · ${dead.length} dead (of ${users.length})`)
await mongoose.disconnect()
