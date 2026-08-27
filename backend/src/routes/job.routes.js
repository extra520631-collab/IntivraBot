import { Router } from 'express'
import { protect, restrictTo } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createJobSchema, updateJobSchema } from '../validators/job.schema.js'
import {
  listJobs,
  myJobs,
  getJob,
  createJob,
  updateJob,
  deleteJob,
} from '../controllers/job.controller.js'

const router = Router()

// All job routes require authentication.
router.use(protect)

router.get('/', listJobs)
router.get('/mine', restrictTo('hr'), myJobs) // must precede '/:id'
router.get('/:id', getJob)

router.post('/', restrictTo('hr'), validate(createJobSchema), createJob)
router.put('/:id', restrictTo('hr'), validate(updateJobSchema), updateJob)
router.delete('/:id', restrictTo('hr'), deleteJob)

export default router
