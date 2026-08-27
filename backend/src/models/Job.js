import mongoose from 'mongoose'

const { Schema, model } = mongoose

const jobSchema = new Schema(
  {
    hr: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: [true, 'Job title is required'], trim: true, maxlength: 120 },
    company: { type: String, trim: true, maxlength: 120 },
    description: { type: String, required: [true, 'Description is required'], maxlength: 5000 },
    skills: { type: [String], default: [] },
    location: { type: String, trim: true, default: 'Remote' },
    type: {
      type: String,
      enum: ['Full-time', 'Part-time', 'Contract', 'Internship'],
      default: 'Full-time',
    },
    experience: { type: String, trim: true, default: '' },

    // ATS gate (Phase 3): a candidate must match >= applyThreshold to apply;
    // >= passThreshold marks a strong candidate.
    applyThreshold: { type: Number, min: 0, max: 100, default: 60 },
    passThreshold: { type: Number, min: 0, max: 100, default: 75 },

    // Questions this HR wants asked verbatim, on top of the AI's adaptive ones.
    // Asked after a warm-up; the AI fills whatever slots are left.
    customQuestions: { type: [String], default: [] },
    questionCount: { type: Number, min: 3, max: 15, default: 5 },
    // Which line of work this role is in — drives the interview's question
    // style. Auto-detected from the title + skills when the HR doesn't pick.
    field: { type: String, trim: true, default: '' },

    status: { type: String, enum: ['open', 'closed', 'draft'], default: 'open', index: true },
  },
  { timestamps: true }
)

// Text index powers keyword search across title, skills and company.
jobSchema.index({ title: 'text', skills: 'text', company: 'text' })

jobSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v
    return ret
  },
})

export default model('Job', jobSchema)
