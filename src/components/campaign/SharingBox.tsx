import { Box, HBarList, Leaderboard, MetricCard } from '@/components/og'
import type { CampaignReport } from '@/lib/campaign-report'
import { CAMPAIGN_COPY } from '@/lib/copy-report'

const S = CAMPAIGN_COPY.sharingBox

// The campaign page's Sharing box (ADV §2): the reward sentence, four cards that wrap rather than
// overflow on a phone (ADV §16), then where it was shared and the top five sharers.
export function SharingBox({ sharing }: { sharing: CampaignReport['sharing'] }) {
  return (
    <Box title={S.title} sub={sharing.sub}>
      <div className="mgrid m4">
        {sharing.cards.map((m) => (
          <MetricCard key={m.title} title={m.title} value={m.value} sub={m.sub} fill={m.fill} />
        ))}
      </div>
      <div className="two eq">
        <div>
          <b className="subt">{S.where}</b>
          {/* Each medium against all shares. */}
          <HBarList rows={sharing.channels} max={sharing.shares} />
        </div>
        <div>
          <b className="subt">{S.top}</b>
          <Leaderboard rows={sharing.topSharers} />
        </div>
      </div>
    </Box>
  )
}
