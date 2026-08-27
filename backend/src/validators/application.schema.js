import { z } from 'zod'

export const applySchema = z.object({
  jobId: z.string().trim().min(1, 'jobId is required'),
  resumeUrl: z.string().url('resumeUrl must be a valid URL').optional(),
  // Raw resume text — when provided, the ATS scores the application on apply.
  resumeText: z.string().trim().max(50000).optional(),
  coverNote: z.string().trim().max(1000).optional(),
})

export const updateStatusSchema = z.object({
  status: z.enum(['applied', 'screened', 'shortlisted', 'interviewed', 'passed', 'rejected']),
})
