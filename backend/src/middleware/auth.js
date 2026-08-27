import { verifyToken } from '../utils/token.js'
import User from '../models/User.js'
import AppError from '../utils/AppError.js'
import { asyncHandler } from '../utils/asyncHandler.js'

// Requires a valid Bearer token; attaches the fresh user to req.user.
export const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) throw new AppError(401, 'Not authenticated — please sign in')

  const decoded = verifyToken(token)
  const user = await User.findById(decoded.sub)
  if (!user) throw new AppError(401, 'Account no longer exists')

  req.user = user
  next()
})

// Restricts a route to specific roles, e.g. restrictTo('hr').
export const restrictTo =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return next(new AppError(403, 'You do not have permission for this action'))
    }
    next()
  }
