import mongoose from 'mongoose'
import crypto from 'crypto'

const { Schema, model } = mongoose

const teamInviteSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    company: { type: String, required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, default: 'Recruiter' }, // display label only
    used: { type: Boolean, default: false },
    usedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, default: () => Date.now() + 14 * 24 * 60 * 60 * 1000 }, // 14 days
  },
  { timestamps: true }
)

teamInviteSchema.statics.newCode = () => crypto.randomBytes(6).toString('hex')

teamInviteSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v
    return ret
  },
})

export default model('TeamInvite', teamInviteSchema)
