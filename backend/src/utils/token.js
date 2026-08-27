import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export const signToken = (userId, role) =>
  jwt.sign({ sub: String(userId), role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn })

export const verifyToken = (token) => jwt.verify(token, env.jwtSecret)
