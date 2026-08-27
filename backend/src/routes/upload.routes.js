import { Router } from 'express'
import multer from 'multer'
import { protect, restrictTo } from '../middleware/auth.js'
import { uploadPhoto, uploadResume, uploadVoice, viewResume } from '../controllers/upload.controller.js'

// Keep files in memory — we stream the buffer straight to Cloudinary.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
})

const router = Router()

router.use(protect)

router.post('/photo', upload.single('file'), uploadPhoto)
router.post('/resume', restrictTo('candidate'), upload.single('file'), uploadResume)
// Voice arrives as base64 PCM in the JSON body, not multipart — no multer here.
router.post('/voice', restrictTo('candidate'), uploadVoice)

// Streams a CV back with the right content type. The bare path is the caller's
// own CV; the :candidateId form is for HR reviewing an applicant.
router.get('/resume', viewResume)
router.get('/resume/:candidateId', viewResume)

export default router
