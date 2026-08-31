import mongoose from 'mongoose'

const { Schema, model } = mongoose

const questionSchema = new Schema(
  {
    order: { type: Number, required: true },
    text: { type: String, required: true },
    // 'hr' = written by the employer on the job post, 'ai' = Gemini-generated,
    // 'fallback' = the AI service was unreachable/out of budget, so this came
    // from the generic offline question bank instead.
    source: { type: String, enum: ['ai', 'hr', 'fallback'], default: 'ai' },
    answer: { type: String, default: '' },
    mode: { type: String, enum: ['voice', 'text'], default: 'text' },
    reason: { type: String }, // why text mode was used (flagged in report)
    score: { type: Number, min: 0, max: 100, default: null },
    feedback: { type: String, default: '' },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    answeredAt: { type: Date },
  },
  { _id: false }
)

// One face/emotion sample captured from a webcam frame during the interview.
const faceSampleSchema = new Schema(
  {
    order: { type: Number }, // question the frame was taken during
    faceCount: { type: Number, default: 0 },
    singlePerson: { type: Boolean, default: false },
    confidence: { type: Number, min: 0, max: 100 }, // composure/positivity
    stress: { type: Number, min: 0, max: 100 },
    label: { type: String }, // dominant emotion
    certainty: { type: Number, min: 0, max: 100, default: null }, // how firmly the model committed
    matchScore: { type: Number, min: 0, max: 100, default: null }, // vs baseline photo
    matched: { type: Boolean, default: null },
    // False when the frame was too dark, blurred or distant to judge. Scoring
    // and flagging both skip these, so a bad webcam never costs a candidate.
    reliable: { type: Boolean, default: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
)

// One voice sample analysed from an answer's audio (Phase 6).
const voiceSampleSchema = new Schema(
  {
    order: { type: Number },
    matchScore: { type: Number, min: 0, max: 100, default: null }, // vs reference voiceprint
    matched: { type: Boolean, default: null },
    multiVoice: { type: Boolean, default: false }, // more than one speaker heard
    voiceCount: { type: Number, default: 1 },
    duration: { type: Number },
    // As above: a clip that was too quiet, clipped or too short to embed
    // reliably is recorded but never flagged.
    reliable: { type: Boolean, default: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
)

const interviewSchema = new Schema(
  {
    // Practice runs have no application or job behind them — they are started
    // straight from the Practice page and never reach HR.
    isPractice: { type: Boolean, default: false, index: true },
    topic: { type: String, trim: true }, // practice only, e.g. "React Fundamentals"

    application: {
      type: Schema.Types.ObjectId,
      ref: 'Application',
      index: true,
      required: [function requiredForRealInterview() { return !this.isPractice }, 'Application is required'],
    },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    job: {
      type: Schema.Types.ObjectId,
      ref: 'Job',
      required: [function requiredForRealInterview() { return !this.isPractice }, 'Job is required'],
    },

    language: { type: String, default: 'English' },
    totalQuestions: { type: Number, default: 5 },
    // Snapshot of the employer's questions taken when the interview starts, so
    // editing the job mid-interview can't change what is asked.
    hrQuestions: { type: [String], default: [] },
    // Detected once on the first question and reused, so every question in one
    // interview is asked in the same field's style.
    field: { type: String, default: '' },
    currentIndex: { type: Number, default: 0 }, // index of the un-answered question
    questions: { type: [questionSchema], default: [] },

    // Face + emotion (Phase 5)
    faceSamples: { type: [faceSampleSchema], default: [] },
    emotionScore: { type: Number, min: 0, max: 100, default: null }, // avg confidence
    faceMatchScore: { type: Number, min: 0, max: 100, default: null }, // avg identity match
    faceFlags: { type: Number, default: 0 }, // frames with no/extra person or mismatch

    // Voice biometrics (Phase 6)
    voiceSamples: { type: [voiceSampleSchema], default: [] },
    voiceRef: { type: [Number], default: undefined, select: false }, // reference voiceprint (first clip)
    voiceMatchScore: { type: Number, min: 0, max: 100, default: null },
    voiceFlags: { type: Number, default: 0 }, // clips with speaker mismatch or multiple voices

    status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress', index: true },

    // Set on finish
    overallScore: { type: Number, min: 0, max: 100, default: null },
    verdict: { type: String },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    completedAt: { type: Date },
  },
  { timestamps: true }
)

// Enforce "one in-progress interview per application/candidate" at the
// database level, not just via the check-then-act read in the controller —
// two concurrent /interviews/start (or /practice) calls for the same
// application/candidate would otherwise both pass the read check before
// either has saved, creating two in-progress interviews.
// Keyed as {application, status} / {candidate, status} rather than the bare
// field alone so this doesn't collide with the plain single-field indexes
// already declared via `index: true` above (same key = Mongoose warns about
// a duplicate schema index, even though the options differ).
interviewSchema.index(
  { application: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'in_progress', isPractice: false } }
)
interviewSchema.index(
  { candidate: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'in_progress', isPractice: true } }
)

interviewSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v
    return ret
  },
})

export default model('Interview', interviewSchema)
