import User from '../models/User.js'
import Job from '../models/Job.js'
import Application from '../models/Application.js'
import AppError from '../utils/AppError.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { cloudinaryEnabled, uploadBuffer } from '../config/cloudinary.js'
import { fetchResume } from '../services/resumeStore.js'
import { aiService } from '../services/aiService.js'
import { teamMemberIds } from '../utils/teamAccess.js'

// Cloudinary decides the delivered Content-Type from the public_id's
// extension. Without one, a raw file comes back as application/octet-stream and
// the browser downloads a nameless blob instead of opening the CV — so the
// extension has to be part of the public_id.
const RESUME_EXT = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
}
const RESUME_TYPES = new Set(Object.keys(RESUME_EXT))
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])

// POST /api/uploads/photo  — any authenticated user uploads a profile photo
export const uploadPhoto = asyncHandler(async (req, res) => {
  if (!cloudinaryEnabled) throw new AppError(503, 'File uploads are not configured on the server')
  if (!req.file) throw new AppError(400, 'No file uploaded (field name must be "file")')
  if (!IMAGE_TYPES.has(req.file.mimetype)) throw new AppError(400, 'Photo must be a PNG, JPG or WEBP image')

  const result = await uploadBuffer(req.file.buffer, {
    folder: 'intivrabot/photos',
    resource_type: 'image',
    public_id: `user_${req.user._id}`,
    overwrite: true,
    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
  })

  await User.findByIdAndUpdate(req.user._id, { photoUrl: result.secure_url })
  res.status(201).json({ success: true, url: result.secure_url })
})

// POST /api/uploads/resume  — candidate uploads a resume; we store it and
// extract its text so the ATS can score future applications.
export const uploadResume = asyncHandler(async (req, res) => {
  if (!cloudinaryEnabled) throw new AppError(503, 'File uploads are not configured on the server')
  if (!req.file) throw new AppError(400, 'No file uploaded (field name must be "file")')
  if (!RESUME_TYPES.has(req.file.mimetype)) throw new AppError(400, 'Resume must be a PDF, DOCX or TXT file')

  const result = await uploadBuffer(req.file.buffer, {
    folder: 'intivrabot/resumes',
    resource_type: 'raw',
    public_id: `user_${req.user._id}.${RESUME_EXT[req.file.mimetype]}`,
    overwrite: true,
    invalidate: true, // drop the CDN copy so a replaced CV shows up immediately
  })

  // Best-effort text extraction via the AI service (null if it's down).
  const extracted = await aiService.extractResumeText(req.file.buffer, req.file.originalname)
  const resumeText = extracted?.text?.trim() || ''

  // Parse the skills out once, here, rather than on every job match.
  const parsed = resumeText ? await aiService.parseResume(resumeText) : null

  await User.findByIdAndUpdate(req.user._id, {
    'profile.resumeUrl': result.secure_url,
    // For raw assets the extension is part of the public_id, not a separate
    // format — store it exactly as Cloudinary returned it or downloads 404.
    'profile.resumePublicId': result.public_id,
    'profile.resumeExt': RESUME_EXT[req.file.mimetype],
    'profile.resumeName': req.file.originalname,
    'profile.resumeText': resumeText,
    'profile.resumeSkills': parsed?.skills || [],
    'profile.resumeUpdatedAt': new Date(),
  })

  res.status(201).json({
    success: true,
    url: result.secure_url,
    text: resumeText,
    chars: extracted?.charCount || 0,
    skills: parsed?.skills || [],
  })
})

const CONTENT_TYPE = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain; charset=utf-8',
}

// GET /api/uploads/resume/:candidateId? — stream a CV back to the browser.
// Cloudinary refuses to deliver PDFs over the CDN unless the account opts in,
// and signed URLs don't help, so we pull the bytes with the authenticated
// download API and pipe them through with the right headers.
export const viewResume = asyncHandler(async (req, res) => {
  const candidateId = req.params.candidateId || req.user._id

  if (String(candidateId) !== String(req.user._id)) {
    // Only HR who actually received an application from this candidate.
    if (req.user.role !== 'hr') throw new AppError(403, 'Forbidden')
    const teamIds = await teamMemberIds(req.user)
    const jobs = await Job.find({ hr: { $in: teamIds } }).select('_id').lean()
    const applied = await Application.exists({
      candidate: candidateId,
      job: { $in: jobs.map((j) => j._id) },
    })
    if (!applied) throw new AppError(403, 'That candidate has not applied to any of your jobs')
  }

  if (!cloudinaryEnabled) throw new AppError(503, 'File storage is not configured on the server')

  const owner = await User.findById(candidateId).select('profile name').lean()
  const profile = owner?.profile || {}

  const { buffer, publicId, ext, error, status } = await fetchResume(profile)
  if (error === 'none') throw new AppError(404, 'No CV uploaded')
  if (error === 'unreachable') throw new AppError(502, 'Could not reach file storage to load the CV')
  if (error) {
    // A 404 means the file itself is gone, not that storage is misbehaving —
    // say so, because re-uploading is the only thing that fixes it.
    if (status === 404) {
      throw new AppError(404, 'That CV is no longer in storage — please upload it again')
    }
    throw new AppError(502, `Could not fetch the CV from storage (${status})`)
  }

  const filename = (profile.resumeName || `cv.${ext}`).replace(/["\\]/g, '')
  // ?download=1 forces a save dialog; otherwise the browser renders it inline.
  const disposition = req.query.download ? 'attachment' : 'inline'

  res.setHeader('Content-Type', CONTENT_TYPE[ext] || 'application/octet-stream')
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`)
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.send(buffer)

  // Record the id that actually worked, so the next request skips the URL
  // parsing, the sniff and the retry — and so a stripped id gets repaired.
  if (profile.resumePublicId !== publicId || profile.resumeExt !== ext) {
    User.findByIdAndUpdate(candidateId, {
      'profile.resumePublicId': publicId,
      'profile.resumeExt': ext,
    }).catch(() => { /* best effort — the response already went out */ })
  }
})

// POST /api/uploads/voice — enroll an account-level voiceprint from a short
// recording. The audio itself is never stored, only the embedding.
export const uploadVoice = asyncHandler(async (req, res) => {
  const { audio, sampleRate } = req.body
  if (!audio) throw new AppError(400, 'No audio provided')

  const status = await aiService.voiceStatus()
  if (!status?.voiceEnabled) {
    throw new AppError(503, 'Voice verification is unavailable right now — please try again later')
  }

  const result = await aiService.voiceAnalyze(audio, sampleRate || 16000)
  if (!Array.isArray(result?.embedding) || result.embedding.length === 0) {
    throw new AppError(422, 'Could not read your voice from that clip — record again in a quieter spot')
  }
  if (result.multiVoice) {
    throw new AppError(422, 'More than one voice was heard — record again on your own')
  }

  await User.findByIdAndUpdate(req.user._id, {
    'profile.voiceRef': result.embedding,
    'profile.voiceEnrolled': true,
    'profile.voiceEnrolledAt': new Date(),
  })

  res.status(201).json({ success: true, enrolled: true, duration: result.duration ?? null })
})
