import { Router } from 'express'
import authRoutes from './auth.routes.js'
import jobRoutes from './job.routes.js'
import applicationRoutes from './application.routes.js'
import interviewRoutes from './interview.routes.js'
import uploadRoutes from './upload.routes.js'
import analyticsRoutes from './analytics.routes.js'
import notificationRoutes from './notification.routes.js'
import teamRoutes from './team.routes.js'

const router = Router()

router.get('/', (req, res) =>
  res.json({
    success: true,
    message: 'IntivraBot API v1',
    endpoints: ['/api/auth', '/api/jobs', '/api/applications', '/api/interviews', '/api/uploads', '/api/analytics', '/api/notifications', '/api/team'],
  })
)

router.use('/auth', authRoutes)
router.use('/jobs', jobRoutes)
router.use('/applications', applicationRoutes)
router.use('/interviews', interviewRoutes)
router.use('/uploads', uploadRoutes)
router.use('/analytics', analyticsRoutes)
router.use('/notifications', notificationRoutes)
router.use('/team', teamRoutes)

export default router
