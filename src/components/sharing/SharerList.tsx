import Link from '@/components/og/Link'
import { Box, LinkButton } from '@/components/og'
import { MAX_SHARERS, PAGE, type SharerRow } from '@/lib/activity'
import { SHARERS as S } from '@/lib/copy-activity'

// The Sharing page's Sharers (Prompt 8): one row per sharer per campaign, newest first. A row opens (a native
// <details>, so it needs no script and works from the keyboard) to the chain behind it: each friend's open, each claim
// and the reward it earned, and friends who got a link of their own. Ids are only tooltips; phones arrive masked.
export function SharerList({ rows, more, limit }: { rows: readonly SharerRow[]; more: boolean; limit: number }) {
  return (
    <Box title={S.title} sub={S.sub}>
      {rows.length ? (
        <div className="shr">
          {rows.map((r) => (
            <details key={r.key}>
              <summary>
                <span className="ph">{r.who}</span>
                <span className="of">
                  {[r.campaign, r.friendOf && S.friendOf(r.friendOf), r.via && S.sharedVia(r.via)].filter(Boolean).join(' · ')}
                </span>
                <span className="v">{[S.counts(r.opened, r.claimed), r.rewards].filter(Boolean).join(' · ')}</span>
              </summary>
              {r.lines.length ? (
                <ul className="hist">
                  {r.lines.map((l) => (
                    <li key={l.key} title={l.title}>
                      {l.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hist-none">{S.none}</p>
              )}
              {r.total > r.lines.length && (
                <p className="hist-none">
                  {S.capped(r.lines.length, r.total)} <Link href={`/app/campaigns/${r.campaignId}#activity`}>{S.cappedLink}</Link>
                </p>
              )}
            </details>
          ))}
        </div>
      ) : (
        <p className="hist-none">{S.empty}</p>
      )}
      {more && limit < MAX_SHARERS && (
        <div className="btns">
          <LinkButton variant="ghost" size="s" href={`/app/sharing?sharers=${limit + PAGE}`} scroll={false}>
            {S.more}
          </LinkButton>
        </div>
      )}
    </Box>
  )
}
