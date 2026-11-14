'use server'

import { searchPlatform, type PlatformSearch } from '@/lib/search'
import { requireAdmin } from '@/lib/session'

export async function platformSearchAction(q: string): Promise<PlatformSearch> {
  await requireAdmin()
  return searchPlatform(q)
}
