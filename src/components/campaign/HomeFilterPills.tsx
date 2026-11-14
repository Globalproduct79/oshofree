'use client'

import { useRouter } from 'next/navigation'
import { FilterPills, type PillOption } from '@/components/og/FilterPills'
import { homeHref, type HomeFilter } from '@/lib/campaign-filters'

// The home's pills drive `?filter=`, so the server renders the chosen list. The prototype redraws
// in place, so the page keeps its scroll.
export function HomeFilterPills({ options, value }: { options: PillOption<HomeFilter>[]; value: HomeFilter }) {
  const router = useRouter()
  return <FilterPills options={options} value={value} onChange={(f) => router.push(homeHref(f), { scroll: false })} />
}
