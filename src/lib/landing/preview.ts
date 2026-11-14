import { lastDay } from '@/lib/campaign-status'
import { COPY } from '@/lib/copy'
import { type LandingView, renderLanding, renderShareSheet } from '@/lib/landing/render'
import type { ShareTargets } from '@/lib/landing/share-targets'
import type { PreviewCampaign } from '@/lib/preview-merge'
import { tokens } from '@/lib/tokens'

// No database here: the console's preview (Prompt 7) draws the landing page in the browser, with the renderer the /o
// routes use. The view is built as viewFor builds it (landing-preview.test.ts pins the two together).

// Where a preview's forms point. A link's code is eight capitals and digits, so this is never one: /o/preview/* has
// routes of its own, and they refuse whatever arrives.
export const PREVIEW_CODE = 'preview'

const TILE_COLORS: readonly string[] = tokens.tileColors
// The offer's last day in UTC, as the real page prints it.
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

const via = (m: keyof ShareTargets) => `/o/${PREVIEW_CODE}/share?via=${m}`

// The landing page of the campaign as a friend opens it ('offer'), or as a sharer sees it once they have left their
// number ('shared', holding the sample link). The flag makes every control inert and says nothing is recorded.
export function previewLandingView(c: PreviewCampaign, state: 'offer' | 'shared'): LandingView {
  return {
    state,
    code: PREVIEW_CODE,
    brand: c.brand,
    headline: c.headline,
    description: c.description,
    imageUrl: c.creative.image,
    color: c.creative.color && TILE_COLORS.includes(c.creative.color) ? c.creative.color : null,
    rewardLabel: c.rewardLabel,
    endsAtText: day.format(lastDay(new Date(c.endsAt))),
    redeemMethod: c.redeemMethod,
    ...(state === 'shared' && { myUrl: c.sampleLink, shareTargets: { whatsapp: via('whatsapp'), sms: via('sms'), x: via('x') } }),
    preview: true,
  }
}

export const previewLanding = (c: PreviewCampaign, state: 'offer' | 'shared') => renderLanding(previewLandingView(c, state))

// The sharer's Share and earn section alone, holding the sample link.
export const previewShareSheet = (c: PreviewCampaign) => renderShareSheet(previewLandingView(c, 'shared'))

// What a sharer's WhatsApp, SMS and X buttons send (the share route's text, then the link), with the sample link.
export const shareMessage = (c: Pick<PreviewCampaign, 'brand' | 'headline' | 'sampleLink'>) =>
  `${COPY.landing.title(c.brand, c.headline)} ${c.sampleLink}`

// What a preview link answers: nothing to show, nothing recorded.
export const previewOnlyView = (): LandingView => ({
  state: 'preview', code: PREVIEW_CODE, brand: '', headline: '', description: '', imageUrl: null, color: null,
  rewardLabel: '', endsAtText: '', redeemMethod: 'code', preview: true,
})
