import { Router } from 'express'
import { protect, restrictTo } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { applySchema, updateStatusSchema } from '../validators/application.schema.js'
import {
  apply,
  myApplications,
  jobApplications,
  getApplication,
  updateStatus,
  updateNotes,
} from '../controllers/application.controller.js'

const router = Router()

router.use(protect)

// Candidate
router.post('/', restrictTo('candidate'), validate(applySchema), apply)
router.get('/mine', restrictTo('candidate'), myApplications)

// HR
router.get('/job/:jobId', restrictTo('hr'), jobApplications)
router.patch('/:id/status', restrictTo('hr'), validate(updateStatusSchema), updateStatus)
router.patch('/:id/notes', restrictTo('hr'), updateNotes)

// HR (job owner) or the candidate who applied
router.get('/:id', getApplication)

export default router
