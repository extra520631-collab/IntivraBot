import { Router } from 'express'
import { protect, restrictTo } from '../middleware/auth.js'
import { hrAnalytics, candidateAnalytics } from '../controllers/analytics.controller.js'

const router = Router()

router.use(protect)

router.get('/hr', restrictTo('hr'), hrAnalytics)
router.get('/candidate', restrictTo('candidate'), candidateAnalytics)

export default router
