import Link from 'next/link'
import { STATUS_FILTERS, type StatusFilter as Filter } from '@/lib/campaign-filters'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'

const H = COPY.home

// The status pills on Home. Each is a link carrying ?status=, so the server does the filtering.
export function StatusFilter({ active, counts }: { active: Filter; counts: Record<Filter, number> }) {
  return (
    <nav aria-label={H.filterLabel} className="mb-5 flex flex-wrap gap-2">
      {STATUS_FILTERS.map((f) => {
        const on = f === active
        return (
          <Link
            key={f}
            href={f === 'all' ? '/app' : `/app?status=${f}`}
            aria-current={on ? 'page' : undefined}
            className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold"
            style={
              on
                ? { backgroundColor: tokens.accentSoft, borderColor: tokens.accent, color: tokens.accent }
                : { backgroundColor: tokens.card, borderColor: tokens.line, color: tokens.ink2 }
            }
          >
            {H.filters[f]}
            <span className="text-[11px]" style={{ color: on ? tokens.accent : tokens.ink3 }}>
              {counts[f]}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
