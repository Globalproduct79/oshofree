import type { Campaign, Country, ShareLink } from '@prisma/client'
import { lastDay } from '@/lib/campaign-status'
import { COPY } from '@/lib/copy'
import type { LandingView } from '@/lib/landing/render'
import type { ShareTargets } from '@/lib/landing/share-targets'
import { MARKETS } from '@/lib/markets'
import { imageUrl } from '@/lib/storage'
import { tokens } from '@/lib/tokens'

export type LinkWithCampaign = ShareLink & { campaign: Campaign }

const TILE_COLORS: readonly string[] = tokens.tileColors

// The offer's last day. Campaign days are UTC days (it stops at midnight UTC), so this prints in UTC,
// the same day the Phoenix card and the console show.
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const endsAtText = (c: Campaign) => day.format(lastDay(c.endsAt))

// One builder for every route: the offer as the campaign stands, plus what the state adds.
export function viewFor(link: LinkWithCampaign, state: LandingView['state'], extras: Partial<LandingView> = {}): LandingView {
  const c = link.campaign
  return {
    state,
    code: link.code,
    brand: c.brand,
    headline: c.headline,
    description: c.description,
    imageUrl: c.creativeImageKey ? imageUrl(c.creativeImageKey) : null,
    color: c.tileColor && TILE_COLORS.includes(c.tileColor) ? c.tileColor : null,
    rewardLabel: c.shareRewardLabel,
    endsAtText: endsAtText(c),
    redeemMethod: c.redeemMethod,
    // The claim code is the visitor's own (issueClaimCode), passed in only once they have asked for it.
    ...extras,
  }
}

// The brand's link as a Location header can carry it: percent-encoded, punycoded host.
// Throws on a URL that does not parse, so callers resolve it before writing any Claim.
export function brandHref(c: Campaign): string | null {
  return c.redeemMethod === 'link' && c.linkUrl ? new URL(c.linkUrl).href : null
}

function statusView(state: 'ended' | 'error', brand = ''): LandingView {
  return {
    state, code: '', brand, headline: '', description: '', imageUrl: null, color: null,
    rewardLabel: '', endsAtText: '', redeemMethod: 'code',
  }
}

export const endedView = (brand?: string) => statusView('ended', brand)
export const errorView = () => statusView('error')

export function phoneError(country: Country): string {
  return country === 'NG' ? COPY.landing.phoneErrorNG : COPY.landing.phoneError(MARKETS[country].name)
}

// The sharer's buttons go through OshoFree first, so the medium is stored before the hand-off.
export function viaLinks(code: string): ShareTargets {
  const via = (m: keyof ShareTargets) => `/o/${code}/share?via=${m}`
  return { whatsapp: via('whatsapp'), sms: via('sms'), x: via('x') }
}
