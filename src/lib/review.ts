import 'server-only'
import type { Campaign, CampaignRevision, WorkspaceStatus, WorkspaceType } from '@prisma/client'
import { hasLicence, isBettingOrDraw } from '@/lib/campaign-schema'
import type { OfferFields } from '@/lib/campaigns'
import { PLACEMENT_LABEL } from '@/lib/copy-components'
import { REVIEW } from '@/lib/copy-review'
import { db } from '@/lib/db'
import { fd, initials, localAmount, usd } from '@/lib/format'
import { checkLink, type LinkState } from '@/lib/link-check'
import { MARKETS, type Country } from '@/lib/markets'
import type { PreviewOffer } from '@/lib/preview-merge'
import { liveCards, type CardData } from '@/lib/reports'
import { imageUrl } from '@/lib/storage'
import { tokens } from '@/lib/tokens'

// The Review page as data (GLB §2.1, spec §6.4 and §6.14.3): the workspaces waiting for approval, the queue
// of campaigns and revised offers waiting for a decision, and every live campaign.

// The page waits for every link check, so each gets a short limit.
const LINK_TIMEOUT_MS = 3000
const R = REVIEW.queue

export type PendingWorkspace = {
  id: string
  name: string
  type: WorkspaceType
  // The country's name ("Ghana").
  country: string
  owner: string | null
  creditCents: number
}

export type QueueRow = {
  // A campaign in review, or the revised offer of a running one; `id` is what Approve and Reject act on.
  kind: 'campaign' | 'revision'
  id: string
  campaignId: string
  workspaceId: string
  // The bold headline ("Revised offer · {headline}" for a revision) and the grey "{brand} via {workspace}".
  title: string
  byline: string
  // Who created the campaign (a revised offer's campaign too); null when no one was recorded.
  createdBy: string | null
  description: string
  // The creative the offer runs: an image as the cover, or a video drawn at its first frame; else colour and initials.
  cover: { imageUrl: string | null; videoUrl: string | null; color: string; initials: string }
  // GLB §2.1 order: country · category · placement · budget · dates · redeem · reward.
  chips: string[]
  // The link check for a link offer; null for a code offer.
  link: LinkState | null
  warnings: string[]
  // Approve waits for the workspace's approval (spec §6.4; a declined workspace stays refused, D4).
  approveEnabled: boolean
  country: Country
  // The offer as the Phoenix preview draws it.
  preview: PreviewOffer
}

export type LiveCard = CardData & { workspaceId: string; href: string }

export type ReviewQueue = { pendingWorkspaces: PendingWorkspace[]; rows: QueueRow[]; livenow: LiveCard[] }

// The campaign's offer as the row shows it: the campaign's own, or with a revision's offer fields over it.
type Offer = Pick<Campaign, keyof OfferFields>
type Waiting = { kind: QueueRow['kind']; id: string; submittedAt: Date; campaign: Campaign; offer: Offer; createdBy: string | null }
type WorkspaceOf = { name: string; status: WorkspaceStatus }

const campaignHref = (id: string) => `/app/campaigns/${id}`

function chips(c: Campaign, o: Offer): string[] {
  const { name, timezone } = MARKETS[c.country]
  return [
    name,
    o.category,
    PLACEMENT_LABEL[o.placement],
    usd(c.budgetUsd * 100),
    R.dates(fd(c.startsAt, timezone), fd(c.endsAt, timezone)),
    o.redeemMethod === 'code' ? R.claimCode : (o.linkUrl ?? ''),
    R.reward(localAmount(c.rewardLocal, c.country)),
  ]
}

function warnings(o: Offer, ws: WorkspaceOf): string[] {
  const out: string[] = []
  if (ws.status === 'pending') out.push(REVIEW.warn.pending)
  if (ws.status === 'declined') out.push(REVIEW.warn.declined)
  if (isBettingOrDraw(o)) out.push(REVIEW.warn.betting(hasLicence(o.description), o.ageGated))
  return out
}

function preview(c: Campaign, o: Offer): PreviewOffer {
  return {
    id: c.id,
    brand: o.brand,
    headline: o.headline,
    category: o.category,
    placement: o.placement,
    ageGated: o.ageGated,
    creative: {
      image: o.creativeImageKey ? imageUrl(o.creativeImageKey) : null,
      video: o.creativeVideoKey ? imageUrl(o.creativeVideoKey) : null,
      color: o.tileColor,
    },
  }
}

const linkOf = (o: Offer) => (o.redeemMethod === 'link' && o.linkUrl ? o.linkUrl : null)

function row(w: Waiting, ws: WorkspaceOf, link: LinkState | null): QueueRow {
  const { campaign: c, offer: o } = w
  return {
    kind: w.kind,
    id: w.id,
    campaignId: c.id,
    workspaceId: c.workspaceId,
    title: w.kind === 'revision' ? R.revised(o.headline) : o.headline,
    byline: R.via(o.brand, ws.name),
    createdBy: w.createdBy,
    description: o.description,
    cover: {
      imageUrl: o.creativeImageKey ? imageUrl(o.creativeImageKey) : null,
      videoUrl: o.creativeVideoKey ? imageUrl(o.creativeVideoKey) : null,
      color: o.tileColor || tokens.tileColors[0],
      initials: initials(o.brand),
    },
    chips: chips(c, o),
    link,
    warnings: warnings(o, ws),
    approveEnabled: ws.status === 'approved',
    country: c.country,
    preview: preview(c, o),
  }
}

const OFFER_KEYS: (keyof Offer)[] = [
  'brand', 'category', 'headline', 'description', 'tileColor', 'creativeImageKey', 'creativeVideoKey', 'placement',
  'redeemMethod', 'claimCode', 'linkUrl', 'ageGated',
]

// A revision stores exactly the offer keys (campaigns.ts offerData) over the running campaign; anything else
// in its JSON is ignored.
function revisedOffer(c: Campaign, r: CampaignRevision): Offer {
  const data = r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? (r.data as Partial<Offer>) : {}
  const revised = Object.fromEntries(OFFER_KEYS.filter((k) => k in data).map((k) => [k, data[k]]))
  return { ...c, ...revised }
}

async function pendingWorkspaces(): Promise<PendingWorkspace[]> {
  const rows = await db.workspace.findMany({
    where: { status: 'pending' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      members: {
        where: { role: 'Owner' },
        orderBy: { user: { createdAt: 'asc' } },
        take: 1,
        select: { user: { select: { name: true } } },
      },
    },
  })
  return rows.map((w) => ({
    id: w.id,
    name: w.name,
    type: w.type,
    country: MARKETS[w.country].name,
    owner: w.members[0]?.user.name ?? null,
    creditCents: w.creditLimitCents,
  }))
}

// Campaigns in review and the revised offers of running campaigns, newest submission first. Each link offer's
// link is checked once, all at the same time.
async function waiting(check: (url: string) => Promise<LinkState>): Promise<QueueRow[]> {
  const ws = { workspace: { select: { name: true, status: true } }, createdBy: { select: { name: true } } } as const
  const [campaigns, revisions] = await Promise.all([
    db.campaign.findMany({ where: { status: 'review' }, include: ws }),
    db.campaignRevision.findMany({ where: { status: 'review' }, include: { campaign: { include: ws } } }),
  ])
  const items: (Waiting & { ws: WorkspaceOf })[] = [
    ...campaigns.map(({ workspace, createdBy, ...c }) => ({
      kind: 'campaign' as const, id: c.id, submittedAt: c.submittedAt ?? c.createdAt, campaign: c, offer: c, ws: workspace,
      createdBy: createdBy?.name ?? null,
    })),
    ...revisions.map((r) => {
      const { workspace, createdBy, ...c } = r.campaign
      return {
        kind: 'revision' as const, id: r.id, submittedAt: r.submittedAt, campaign: c, offer: revisedOffer(c, r), ws: workspace,
        createdBy: createdBy?.name ?? null,
      }
    }),
  ].sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime() || (a.id < b.id ? 1 : -1))
  const urls = [...new Set(items.map((i) => linkOf(i.offer)).filter((u): u is string => u !== null))]
  const states = new Map(await Promise.all(urls.map(async (u) => [u, await check(u)] as const)))
  return items.map((i) => {
    const url = linkOf(i.offer)
    return row(i, i.ws, url === null ? null : (states.get(url) ?? 'broken'))
  })
}

export async function reviewQueue(
  now: Date,
  opts: { checkLink?: (url: string) => Promise<LinkState> } = {},
): Promise<ReviewQueue> {
  const check = opts.checkLink ?? ((url: string) => checkLink(url, fetch, LINK_TIMEOUT_MS))
  const [pending, rows, live] = await Promise.all([pendingWorkspaces(), waiting(check), liveCards(now)])
  return { pendingWorkspaces: pending, rows, livenow: live.map((c) => ({ ...c, href: campaignHref(c.id) })) }
}
