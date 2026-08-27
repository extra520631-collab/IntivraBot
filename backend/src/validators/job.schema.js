import { z } from 'zod'

const jobType = z.enum(['Full-time', 'Part-time', 'Contract', 'Internship'])

export const createJobSchema = z
  .object({
    title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
    company: z.string().trim().max(120).optional(),
    description: z.string().trim().min(10, 'Description is too short').max(5000),
    skills: z.array(z.string().trim().min(1)).min(1, 'Add at least one skill').max(30),
    location: z.string().trim().max(120).optional(),
    type: jobType.optional(),
    experience: z.string().trim().max(60).optional(),
    applyThreshold: z.number().int().min(0).max(100).optional(),
    passThreshold: z.number().int().min(0).max(100).optional(),
    customQuestions: z.array(z.string().trim().min(5, 'A question needs at least 5 characters').max(300)).max(10).optional(),
    questionCount: z.number().int().min(3).max(15).optional(),
    field: z.string().trim().max(40).optional(),
    status: z.enum(['open', 'closed', 'draft']).optional(),
  })
  .refine((d) => d.passThreshold == null || d.applyThreshold == null || d.passThreshold >= d.applyThreshold, {
    message: 'passThreshold must be greater than or equal to applyThreshold',
    path: ['passThreshold'],
  })

// All fields optional for PATCH/PUT updates.
export const updateJobSchema = createJobSchema.innerType().partial()
