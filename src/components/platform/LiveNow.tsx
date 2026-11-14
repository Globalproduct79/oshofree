import { REVIEW } from '@/lib/copy-review'
import type { LiveCard } from '@/lib/review'
import { EnterCampaignCards } from './EnterCampaignCards'

// "Live now" (GLB §2.1 block 4): every live campaign on the platform, each opened inside its own workspace.
export function LiveNow({ cards }: { cards: LiveCard[] }) {
  return (
    <>
      <div className="sect">
        <h3>{REVIEW.live.title}</h3>
        <span className="n">{cards.length}</span>
      </div>
      <EnterCampaignCards cards={cards} />
    </>
  )
}
