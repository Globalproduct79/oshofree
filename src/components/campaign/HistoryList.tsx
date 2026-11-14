import { Box } from '@/components/og'
import { CAMPAIGN_COPY } from '@/lib/copy-report'

const H = CAMPAIGN_COPY.history

// Ours (spec §6.8): Global's decisions on the campaign and its revised offers, newest first, under who created it
// and when (Prompt 6) when that was recorded.
export function HistoryList({ lines, created }: { lines: readonly string[]; created?: string | null }) {
  return (
    <Box title={H.title} sub={created ?? undefined}>
      {lines.length ? (
        <ul className="hist">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      ) : (
        <p className="hist-none">{H.empty}</p>
      )}
    </Box>
  )
}
