import { Box, LinkButton } from '@/components/og'
import { lineAnchor, type CampaignActivity } from '@/lib/activity'
import { ACTIVITY as A } from '@/lib/copy-activity'
import { ActivityList } from './ActivityList'
import { ScrollHere } from './ScrollHere'

// The campaign page's Recent activity (Prompt 8): every recorded event, one line each, newest first, the ids behind a
// line only in its tooltip. A page that starts below the newest line (a link to one line from Global's held rewards,
// or a later page reached without script) leads back with Newest; a linked line is lit and scrolled to. A Viewer sees
// it all; nothing here changes anything.
export function ActivityBox({
  campaignId,
  market,
  lines,
  next,
  line,
  windowed,
}: CampaignActivity & { campaignId: string; market: string }) {
  return (
    <Box title={A.title} sub={A.sub(market)} id="activity">
      {windowed && (
        <div className="btns top">
          <LinkButton variant="ghost" size="s" href={`/app/campaigns/${campaignId}`} scroll={false}>
            {A.newest}
          </LinkButton>
        </div>
      )}
      {lines.length ? (
        // Keyed by where the page starts, so a new page (Newest, another link) starts its list afresh.
        <ActivityList key={`${line ?? ''}|${lines[0].key}`} campaignId={campaignId} lines={lines} next={next} line={line} />
      ) : (
        <p className="hist-none">{windowed ? A.noOlder : A.empty}</p>
      )}
      {line && <ScrollHere id={lineAnchor(line)} />}
    </Box>
  )
}
