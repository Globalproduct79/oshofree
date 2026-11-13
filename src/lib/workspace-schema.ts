import { z } from 'zod'
import { COUNTRIES } from '@/lib/markets'

export const workspaceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(['Brand', 'Agency']),
  country: z.enum(COUNTRIES),
})
