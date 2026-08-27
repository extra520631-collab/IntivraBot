import mongoose from 'mongoose'

const { Schema, model } = mongoose

const applicationSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    resumeUrl: { type: String },
    coverNote: { type: String, maxlength: 1000 },

    // Filled by the ATS step (Phase 3). Null until scored.
    atsScore: { type: Number, min: 0, max: 100, default: null },
    matchedSkills: { type: [String], default: [] },

    // Filled after the interview (Phases 4-7).
    interviewScore: { type: Number, min: 0, max: 100, default: null },
    emotionScore: { type: Number, min: 0, max: 100, default: null },
    flags: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['applied', 'screened', 'shortlisted', 'interviewed', 'passed', 'rejected'],
      default: 'applied',
      index: true,
    },

    // The hiring team's private notes. Never returned to the candidate — see
    // getApplication / myApplications, which only the owning HR can read.
    hrNotes: { type: String, maxlength: 4000, default: '' },
    hrNotesUpdatedAt: { type: Date },
  },
  { timestamps: true }
)

// A candidate can apply to a given job only once.
applicationSchema.index({ job: 1, candidate: 1 }, { unique: true })

applicationSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v
    return ret
  },
})

export default model('Application', applicationSchema)
