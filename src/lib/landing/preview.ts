import { COPY } from '@/lib/copy'
import { type LandingView, renderLanding, renderShareSheet } from '@/lib/landing/render'
import type { ShareTargets } from '@/lib/landing/share-targets'
import { offerView } from '@/lib/landing/view'
import type { PreviewCampaign } from '@/lib/preview-merge'

// No database here: the console's preview (Prompt 7) draws the landing page in the browser, with the renderer the /o
// routes use and the builder viewFor uses (offerView), so the two cannot drift.

// Where a preview's forms point. A link's code is eight capitals and digits, so this is never one: /o/preview/* has
// routes of its own, and they refuse whatever arrives.
export const PREVIEW_CODE = 'preview'

const via = (m: keyof ShareTargets) => `/o/${PREVIEW_CODE}/share?via=${m}`

// A form with no headline yet reads "Your headline", as the wall's card does, never an empty heading.
const headlineOf = (c: Pick<PreviewCampaign, 'headline'>) => c.headline || COPY.preview.headline

// The landing page of the campaign as a friend opens it ('offer'), or as a sharer sees it once they have left their
// number ('shared', holding the sample link). The flag makes every control inert and says nothing is recorded.
export function previewLandingView(c: PreviewCampaign, state: 'offer' | 'shared'): LandingView {
  const offer = {
    brand: c.brand,
    headline: headlineOf(c),
    description: c.description,
    imageUrl: c.creative.image,
    videoUrl: c.creative.video,
    tileColor: c.creative.color,
    shareRewardLabel: c.rewardLabel,
    endsAt: new Date(c.endsAt),
    redeemMethod: c.redeemMethod,
  }
  const sharer = state === 'shared' && { myUrl: c.sampleLink, shareTargets: { whatsapp: via('whatsapp'), sms: via('sms'), x: via('x') } }
  return offerView(offer, state, PREVIEW_CODE, { ...sharer, preview: true })
}

export const previewLanding = (c: PreviewCampaign, state: 'offer' | 'shared') => renderLanding(previewLandingView(c, state))

// The sharer's Share and earn section alone, holding the sample link.
export const previewShareSheet = (c: PreviewCampaign) => renderShareSheet(previewLandingView(c, 'shared'))

// What a sharer's WhatsApp, SMS and X buttons send (the share route's text, then the link), with the sample link.
export const shareMessage = (c: Pick<PreviewCampaign, 'brand' | 'headline' | 'sampleLink'>) =>
  `${COPY.landing.title(c.brand, headlineOf(c))} ${c.sampleLink}`

// What a preview link answers: nothing to show, nothing recorded.
export const previewOnlyView = (): LandingView => ({
  state: 'preview', code: PREVIEW_CODE, brand: '', headline: '', description: '', imageUrl: null, color: null,
  rewardLabel: '', endsAtText: '', redeemMethod: 'code', preview: true,
})
