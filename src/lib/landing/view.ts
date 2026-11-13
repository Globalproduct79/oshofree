import type { Campaign, Country, ShareLink } from '@prisma/client'
import { COPY } from '@/lib/copy'
import type { LandingView } from '@/lib/landing/render'
import type { ShareTargets } from '@/lib/landing/share-targets'
import { MARKETS } from '@/lib/markets'
import { imageUrl } from '@/lib/storage'
import { tokens } from '@/lib/tokens'

export type LinkWithCampaign = ShareLink & { campaign: Campaign }

const TILE_COLORS: readonly string[] = tokens.tileColors

// The day the offer ends, as the campaign's own market reads it.
function endsAtText(c: Campaign): string {
  const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: MARKETS[c.country].timezone })
  return fmt.format(c.endsAt)
}

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
    // The code reaches the page only once the visitor has asked for it.
    claimCode: state === 'code' ? (c.claimCode ?? undefined) : undefined,
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
