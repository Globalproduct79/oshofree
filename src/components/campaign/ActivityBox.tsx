import { Box, LinkButton } from '@/components/og'
import { lineAnchor, MAX_LINES, PAGE, type ActivityLine } from '@/lib/activity'
import { ACTIVITY as A } from '@/lib/copy-activity'
import { ScrollHere } from './ScrollHere'

// The campaign page's Recent activity (Prompt 8): every recorded event, one line each, newest first, the ids behind a
// line only in its tooltip. Show more asks the page for 30 more and keeps the scroll; a link to one line (Global's held
// rewards) lights it and scrolls to it. A Viewer sees it all; nothing here changes anything.
export function ActivityBox({
  campaignId,
  market,
  lines,
  more,
  limit,
  line,
}: {
  campaignId: string
  market: string
  lines: readonly ActivityLine[]
  more: boolean
  limit: number
  line: string | null
}) {
  return (
    <Box title={A.title} sub={A.sub(market)} id="activity">
      {lines.length ? (
        <ul className="hist">
          {lines.map((l) => {
            const on = l.key === line
            return (
              <li key={l.key} id={lineAnchor(l.key)} title={l.title} className={on ? 'on' : undefined} aria-current={on ? 'true' : undefined}>
                {l.text}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="hist-none">{A.empty}</p>
      )}
      {more && limit < MAX_LINES && (
        <div className="btns">
          <LinkButton variant="ghost" size="s" href={`/app/campaigns/${campaignId}?activity=${limit + PAGE}`} scroll={false}>
            {A.more}
          </LinkButton>
        </div>
      )}
      {line && <ScrollHere id={lineAnchor(line)} />}
    </Box>
  )
}
