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
  // Set when the employer disallowed typing but the candidate reported a
  // genuine blocker. The server decides whether it actually applies.
  hardship: z.boolean().optional(),
})

// Anything the candidate says that is not an attempt to answer.
export const askSchema = z.object({
  text: z.string().trim().min(1, 'Say something first').max(2000),
})

export const screenSchema = z.object({
  type: z.enum(['started', 'stopped', 'wrong_surface']),
  surface: z.string().trim().max(40).optional(),
  gapSeconds: z.number().min(0).max(86400).optional(),
})
