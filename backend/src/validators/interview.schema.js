import { z } from 'zod'

export const startSchema = z.object({
  applicationId: z.string().trim().min(1, 'applicationId is required'),
  language: z.enum(['English', 'Urdu']).optional(),
})

// Practice needs no application — an unknown topic falls back server-side.
export const practiceSchema = z.object({
  topic: z.string().trim().max(60).optional(),
  language: z.enum(['English', 'Urdu']).optional(),
})

export const answerSchema = z.object({
  answer: z.string().trim().min(1, 'Answer cannot be empty').max(5000),
  mode: z.enum(['voice', 'text']).optional(),
  reason: z.string().trim().max(200).optional(),
})
