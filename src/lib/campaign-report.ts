import 'server-only'
import type { Campaign, CampaignRevision, CampaignStatus, RejectReason, ReviewAction, Workspace } from '@prisma/client'
import { ymd } from '@/lib/campaign-schema'
import { campaignFacts, RUNNING, type CampaignFacts } from '@/lib/campaigns'
import { isRejectReason, rejectReasonText } from '@/lib/copy-campaign'
import { PLACEMENT_LABEL } from '@/lib/copy-components'
import { CAMPAIGN_COPY as C, REPORT_COPY } from '@/lib/copy-report'
import { db } from '@/lib/db'
import { fd, fmt, localAmount, pct, usd } from '@/lib/format'
import { MARKETS } from '@/lib/markets'
import { currentCpmCents } from '@/lib/rates'
import { campaignMetrics, type CampaignMetrics, type Sharer } from '@/lib/reports'
import { creativeUrl } from '@/lib/storage'

// The campaign page (ADV §2) as text and numbers, from campaignMetrics and campaignFacts. Every
// formula is the prototype's; the History list and the revision status lines are ours (spec §6.8,
// §6.14.3).

export type Metric = { title: string; value: string; sub: string; fill?: number }

export type ChangeModel = {
  budgetUsd: number
  // ceil(spend): the input's min, as the prototype had it.
  minBudgetUsd: number
  // The market-local 'YYYY-MM-DD' of the end, as the campaign form shows it.
  endsOn: string
  rewardLocal: number
  currency: string
  canSave: boolean
  canEnd: boolean
}

export type CampaignReport = {
  lead: string
  // The words after the badge: grey, or red (`bad`) for a rejection.
  note: { text: string; bad: boolean } | null
  kpis: Metric[]
  dailySub: string
  days: number[]
  funnel: { rows: { label: string; value: number }[]; base: number }
  sharing: {
    sub: string
    cards: Metric[]
    channels: { label: string; value: number; display: string }[]
    shares: number
    topSharers: Sharer[]
  }
  change: ChangeModel
  // The creative the offer runs (its URL from storage), or none: then the card shows the tile colour.
  offer: { items: { label: string; value: string }[]; description: string; creative: { kind: 'image' | 'video'; url: string } | null }
  // "Created by {name} on {date}", or null for a campaign from before creators were recorded.
  created: string | null
  history: string[]
}

// "Where it was shared" keeps the prototype's fixed order.
const WHERE = ['whatsapp', 'x', 'facebook', 'sms'] as const
const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b)
const PHOENIX = 'phoenix'

// "{label}: {note}" for a coded rejection; slice-1 rows have only the note.
const rejection = (code: RejectReason | null, note: string | null): string =>
  code ? rejectReasonText(code, note) : (note?.trim() ?? '')

// The decision record keeps "{code}: {note}" (campaigns.ts decisionReason); anything else is shown as stored.
function decisionReason(reason: string | null): string {
  if (!reason) return ''
  const cut = reason.indexOf(': ')
  const code = cut < 0 ? reason : reason.slice(0, cut)
  return isRejectReason(code) ? rejectReasonText(code, cut < 0 ? null : reason.slice(cut + 2)) : reason
}

function statusNote(c: Campaign, latest: CampaignRevision | undefined): CampaignReport['note'] {
  if (c.status === 'review') return { text: C.status.review, bad: false }
  if (c.status === 'rejected') {
    const reason = rejection(c.rejectReasonCode, c.rejectReason)
    return reason ? { text: reason, bad: true } : null
  }
  // A credit pause comes first, then a revised offer's state, each after its own "·".
  const credit = c.status === 'paused' && c.pausedBy === 'credit' ? { text: C.status.pausedOverCredit, bad: true } : null
  const revision = RUNNING.includes(c.status) && latest ? revisionNote(latest) : null
  if (credit && revision) return { text: `${credit.text} ${revision.text}`, bad: true }
  return credit ?? revision
}

function revisionNote(latest: CampaignRevision): CampaignReport['note'] {
  if (latest.status === 'review') return { text: C.status.revisionInReview, bad: false }
  if (latest.status === 'rejected') {
    return { text: C.status.revisionRejected(rejection(latest.rejectReasonCode, latest.rejectReason)), bad: true }
  }
  return null
}

function dailySub(status: CampaignStatus, f: CampaignFacts): string {
  switch (status) {
    case 'live':
      return C.daily.left(usd(f.leftCents), f.daysLeft)
    case 'paused':
      return C.daily.paused
    case 'scheduled':
      return C.daily.scheduled
    case 'ended':
      return C.daily.ended
    case 'rejected':
      return C.daily.rejected
    default:
      // In review, or a draft not sent yet: either starts once Global approves it.
      return C.daily.review
  }
}

function kpis(c: Campaign, m: CampaignMetrics, f: CampaignFacts): Metric[] {
  const K = C.kpi
  return [
    { title: K.impressions, value: fmt(m.imp), sub: K.today(fmt(m.days[m.days.length - 1] ?? 0)), fill: f.spendPct },
    // 10% open rate fills the line.
    { title: K.openRate, value: pct(m.opens, m.imp), sub: K.opened(fmt(m.opens)), fill: (m.openRate / 0.1) * 100 },
    {
      title: K.claims[c.redeemMethod],
      value: fmt(m.claims),
      sub: m.costPerClaimCents === null ? K.none : K.each(usd(m.costPerClaimCents)),
      fill: ratio(m.claims, m.opens) * 100,
    },
    {
      title: K.spent,
      value: usd(m.spendCents),
      sub: K.spentOf(usd(c.budgetUsd * 100), usd(m.rewardCents)),
      fill: f.spendPct,
    },
  ]
}

function sharing(c: Campaign, m: CampaignMetrics, pointsPerShare: number): CampaignReport['sharing'] {
  const S = C.sharingBox
  const capCents = (c.budgetUsd * 100 * c.rewardCapPct) / 100
  return {
    sub: S.sub(localAmount(c.rewardLocal, c.country), pointsPerShare, c.rewardCapPct),
    cards: [
      // Shares ÷ opens, 10% fills the line.
      { title: S.shares, value: fmt(m.shares), sub: S.fromOpens(fmt(m.opens)), fill: (ratio(m.shares, m.opens) / 0.1) * 100 },
      {
        title: S.friendsOpened,
        value: fmt(m.sOpens),
        sub: S.viral(m.viral.toFixed(2)),
        fill: Math.min(100, ratio(m.sOpens, m.shares) * 50),
      },
      { title: S.friendsClaimed, value: fmt(m.sClaims), sub: S.ofOpens(pct(m.sClaims, m.sOpens)), fill: ratio(m.sClaims, m.sOpens) * 100 },
      {
        title: S.rewardsPaid,
        value: usd(m.rewardCents),
        // The airtime the payouts stored, not the dollars converted back: a ₦50 reward is 3 cents, which is ₦46.50 again.
        sub: S.airtime(localAmount(m.rewardLocal, c.country)),
        fill: ratio(m.rewardCents, capCents) * 100,
      },
    ],
    channels: WHERE.map((v) => ({ label: REPORT_COPY.via[v], value: m.channels[v], display: fmt(m.channels[v]) })),
    shares: m.shares,
    topSharers: m.topSharers,
  }
}

// One line per decision of Global's, newest first; submissions are not decisions. A revised offer's decision
// writes both its revision row and a ReviewAction at the same instant; the revision row says which it was, so
// that action is not counted again as a decision on the campaign.
function history(c: Campaign, actions: ReviewAction[], revisions: CampaignRevision[]): string[] {
  const H = C.history
  const decided = revisions.filter((r): r is CampaignRevision & { decidedAt: Date } => r.status !== 'review' && r.decidedAt !== null)
  const ofRevision = (a: ReviewAction) =>
    decided.some((r) => r.decidedAt.getTime() === a.at.getTime() && (r.status === 'applied') === (a.action === 'Approve'))
  const lines: { at: Date; what: string }[] = [
    ...decided.map((r) => ({
      at: r.decidedAt,
      what: r.status === 'applied' ? H.revisionApproved : H.revisionRejected(rejection(r.rejectReasonCode, r.rejectReason)),
    })),
    ...actions
      .filter((a) => (a.action === 'Approve' || a.action === 'Reject') && !ofRevision(a))
      .map((a) => ({ at: a.at, what: a.action === 'Approve' ? H.approved : H.rejected(decisionReason(a.reason)) })),
  ]
  const tz = MARKETS[c.country].timezone
  return lines.sort((a, b) => b.at.getTime() - a.at.getTime()).map((l) => H.line(fd(l.at, tz), l.what))
}

// The CPM the campaign was priced at; one never submitted shows Phoenix's current rate, or none.
async function placementCpmCents(c: Campaign, now: Date): Promise<number | null> {
  if (c.cpmCents !== null) return c.cpmCents
  const phoenix = await db.channel.findUnique({ where: { key: PHOENIX }, select: { id: true } })
  return phoenix ? currentCpmCents(phoenix.id, c.country, c.placement, now).catch(() => null) : null
}

// Who created the campaign; null when no one was recorded (a campaign from before the column, or a deleted user).
async function creatorOf(c: Campaign): Promise<string | null> {
  if (!c.createdById) return null
  const user = await db.user.findUnique({ where: { id: c.createdById }, select: { name: true } })
  return user?.name ?? null
}

// A video when it has one (a video or a splash video), else the image.
function creativeOf(c: Campaign): CampaignReport['offer']['creative'] {
  if (c.creativeVideoKey) return { kind: 'video', url: creativeUrl(c.creativeVideoKey) }
  return c.creativeImageKey ? { kind: 'image', url: creativeUrl(c.creativeImageKey) } : null
}

export async function campaignReport(
  c: Campaign, ws: Pick<Workspace, 'pointsPerShare'>, now: Date,
): Promise<CampaignReport> {
  const [m, f, revisions, actions, cpmCents, creator] = await Promise.all([
    campaignMetrics(c.id, now),
    campaignFacts(c.id, now),
    db.campaignRevision.findMany({ where: { campaignId: c.id }, orderBy: { submittedAt: 'desc' } }),
    db.reviewAction.findMany({ where: { targetType: 'Campaign', targetId: c.id }, orderBy: { at: 'desc' } }),
    placementCpmCents(c, now),
    creatorOf(c),
  ])
  const { name: country, currency, timezone } = MARKETS[c.country]
  const placement = PLACEMENT_LABEL[c.placement]
  const O = C.offer
  const F = C.funnel
  return {
    lead: C.lead(c.brand, country, placement, fd(c.startsAt, timezone), fd(c.endsAt, timezone)),
    note: statusNote(c, revisions[0]),
    kpis: kpis(c, m, f),
    dailySub: dailySub(c.status, f),
    days: m.days,
    funnel: {
      rows: [
        { label: F.saw, value: m.imp },
        { label: F.opened, value: m.opens },
        { label: F.claimed[c.redeemMethod], value: m.claims },
        { label: F.shared, value: m.shares },
        { label: F.friendClaimed, value: m.sClaims },
      ],
      base: m.imp,
    },
    sharing: sharing(c, m, ws.pointsPerShare),
    change: {
      budgetUsd: c.budgetUsd,
      minBudgetUsd: Math.ceil(m.spendCents / 100),
      endsOn: ymd(c.endsAt, c.country),
      rewardLocal: c.rewardLocal,
      currency,
      canSave: c.status !== 'ended' && c.status !== 'rejected',
      canEnd: c.status === 'live' || c.status === 'paused',
    },
    offer: {
      items: [
        { label: O.headline, value: c.headline },
        { label: O.redeem, value: O.redeemAs[c.redeemMethod] },
        { label: O.category, value: c.category },
        { label: O.placement, value: cpmCents === null ? placement : O.placementAt(placement, (cpmCents / 100).toFixed(2)) },
      ],
      description: c.description,
      creative: creativeOf(c),
    },
    created: creator === null ? null : C.history.created(creator, fd(c.createdAt, timezone)),
    history: history(c, actions, revisions),
  }
}
