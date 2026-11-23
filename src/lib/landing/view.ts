import type { Campaign, Country, ShareLink } from '@prisma/client'
import { lastDay } from '@/lib/campaign-status'
import { COPY } from '@/lib/copy'
import type { LandingView } from '@/lib/landing/render'
import type { ShareTargets } from '@/lib/landing/share-targets'
import { MARKETS } from '@/lib/markets'
import { imageUrl } from '@/lib/image-rules'
import { tokens } from '@/lib/tokens'

// No database here: the console's preview (lib/landing/preview) builds its view with offerView in the browser.

export type LinkWithCampaign = ShareLink & { campaign: Campaign }

const TILE_COLORS: readonly string[] = tokens.tileColors

// The offer's last day. Campaign days are UTC days (it stops at midnight UTC), so this prints in UTC,
// the same day the Phoenix card and the console show.
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const endsAtText = (endsAt: Date) => day.format(lastDay(endsAt))

// The offer as every view prints it: its words, its image or video, its tile colour when it is one of the wall's, its reward and
// its last day. A stored campaign (viewFor) and the console's preview of one (lib/landing/preview) both build it here.
export type LandingOffer = Pick<Campaign, 'brand' | 'headline' | 'description' | 'tileColor' | 'shareRewardLabel' | 'endsAt' | 'redeemMethod'> & {
  imageUrl: string | null
  videoUrl?: string | null
}

export function offerView(o: LandingOffer, state: LandingView['state'], code: string, extras: Partial<LandingView> = {}): LandingView {
  return {
    state,
    code,
    brand: o.brand,
    headline: o.headline,
    description: o.description,
    imageUrl: o.imageUrl,
    videoUrl: o.videoUrl ?? null,
    color: o.tileColor && TILE_COLORS.includes(o.tileColor) ? o.tileColor : null,
    rewardLabel: o.shareRewardLabel,
    endsAtText: endsAtText(o.endsAt),
    redeemMethod: o.redeemMethod,
    ...extras,
  }
}

// One builder for every route: the offer as the campaign stands, plus what the state adds.
export function viewFor(link: LinkWithCampaign, state: LandingView['state'], extras: Partial<LandingView> = {}): LandingView {
  const c = link.campaign
  // The claim code is the visitor's own (issueClaimCode), passed in only once they have asked for it.
  const creative = {
    imageUrl: c.creativeImageKey ? imageUrl(c.creativeImageKey) : null,
    videoUrl: c.creativeVideoKey ? imageUrl(c.creativeVideoKey) : null,
  }
  return offerView({ ...c, ...creative }, state, link.code, extras)
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
