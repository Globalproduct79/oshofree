import { Box } from '@/components/og'
import { CAMPAIGN_COPY } from '@/lib/copy-report'

const H = CAMPAIGN_COPY.history

// Ours (spec §6.8): Global's decisions on the campaign and its revised offers, newest first.
export function HistoryList({ lines }: { lines: readonly string[] }) {
  return (
    <Box title={H.title}>
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
