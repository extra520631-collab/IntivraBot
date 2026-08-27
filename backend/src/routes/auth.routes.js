import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { validate } from '../middleware/validate.js'
import { protect } from '../middleware/auth.js'
import {
  registerSchema,
  loginSchema,
  forgotSchema,
  resetSchema,
  updateMeSchema,
  changePasswordSchema,
  deleteMeSchema,
} from '../validators/auth.schema.js'
import {
  register,
  login,
  me,
  updateMe,
  changePassword,
  exportMe,
  deleteMe,
  forgotPassword,
  resetPassword,
} from '../controllers/auth.controller.js'

const router = Router()

// Stricter limiter on credential endpoints to slow brute-force attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later.' },
})

router.post('/register', authLimiter, validate(registerSchema), register)
router.post('/login', authLimiter, validate(loginSchema), login)
router.post('/forgot-password', authLimiter, validate(forgotSchema), forgotPassword)
router.post('/reset-password', authLimiter, validate(resetSchema), resetPassword)
router.get('/me', protect, me)
router.patch('/me', protect, validate(updateMeSchema), updateMe)
router.get('/me/export', protect, exportMe)
router.delete('/me', protect, validate(deleteMeSchema), deleteMe)
router.patch('/password', protect, validate(changePasswordSchema), changePassword)

export default router
