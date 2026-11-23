import type { PayoutStatus, RedeemMethod, ShareVia } from '@prisma/client'
import { REWARDS_LEDGER } from '@/lib/copy-rewards-ledger'
import { num } from '@/lib/format'

// Ours (Prompt 8): every recorded event of the referral journey as one line, on the campaign page (Recent activity)
// and the Sharing page (Sharers). Phones are masked before they reach these strings; ids go in the line's tooltip.

type Claim = Record<RedeemMethod, (who: string) => string>

export const ACTIVITY = {
  title: 'Recent activity',
  sub: (market: string) => `Every event on this campaign, newest first, in ${market} time. Hover a line for its record id.`,
  empty: 'Nothing yet. Impressions, opens, claims, shares and rewards show here as they are recorded.',
  more: 'Show more',
  // A page that starts below the newest line (a linked line, or a later page) leads back to the top.
  newest: 'Newest',
  noOlder: 'Nothing older than this.',
  moreFailed: "Older activity didn't load. Try Show more again.",
  // "{what} · {when}"
  line: (what: string, when: string) => `${what} · ${when}`,
  // An hour's impressions: "14 Nov, 10:00–11:00".
  hour: (from: string, to: string) => `${from}–${to}`,
  impressions: (n: number, channel: string) => `${num(n)} ${n === 1 ? 'impression' : 'impressions'} from ${channel}`,
  open: (channel: string) => `A ${channel} user opened the offer`,
  claim: {
    code: (channel) => `A ${channel} user took claim code PHX-••••`,
    link: (channel) => `A ${channel} user clicked through to your site`,
  } satisfies Claim,
  // The offer page reached by its own link (Phoenix's click-through for a link offer), not a sharer's.
  follow: { code: () => 'Someone took claim code PHX-•••• on the offer page', link: () => 'Someone followed the link to your site' } satisfies Claim,
  pageOpen: 'Someone opened the offer page',
  share: (sharer: string, via: string) => `${sharer} shared via ${via}`,
  ownLink: (sharer: string) => `${sharer} got a link of their own`,
  friendOf: (what: string, parent: string) => `${what} (friend of ${parent})`,
  friendOpen: (sharer: string) => `A friend of ${sharer} opened the offer`,
  friendClaim: {
    code: (sharer) => `A friend of ${sharer} took claim code PHX-••••`,
    link: (sharer) => `A friend of ${sharer} clicked through to your site`,
  } satisfies Claim,
  // "₦50 airtime for +234 80• ••• 4471 held — No phone number"
  reward: (amount: string, sharer: string, status: PayoutStatus, reason: string | null) =>
    `${amount} airtime for ${sharer} ${ACTIVITY.status[status]}${reason ? ` — ${reason}` : ''}`,
  points: (n: number, sharer: string) =>
    n < 0 ? `${num(-n)} points taken back from ${sharer}` : `${num(n)} ${n === 1 ? 'point' : 'points'} for ${sharer}`,
  // A sharer Phoenix gave no number for, by the end of their session id: the slice-2 spec's words (sharer identity),
  // the one label Top sharers, Sharing, Recent activity and the Rewards ledger all use.
  phoenixUser: (tail: string) => `Phoenix user · ••${tail}`,
  someone: 'a sharer',
  channels: { phoenix: 'Phoenix', boomplay: 'Boomplay' } as Record<string, string>,
  channelList: (names: string[]) => names.join(' and '),
  via: {
    whatsapp: 'WhatsApp',
    sms: 'SMS',
    x: 'X',
    facebook: 'Facebook',
    copy: 'a copied link',
    other: 'another app',
  } satisfies Record<ShareVia, string>,
  status: { queued: 'queued', sent: 'sent', held: 'held', blocked: 'blocked', rejected: 'rejected' } satisfies Record<PayoutStatus, string>,
  // The same words Global's Rewards ledger uses, so a held line reads the same on both pages.
  reasons: REWARDS_LEDGER.reasons,
} as const

// The Sharing page's Sharers box: one row per sharer per campaign, opened to show what their friends did.
export const SHARERS = {
  title: 'Sharers',
  sub: "Each sharer, newest first. Open one to follow the chain: their friends' opens and claims, the reward each claim earned, and friends who got a link of their own.",
  empty: 'No sharers yet. They appear once someone shares one of your offers.',
  more: 'Show more',
  friendOf: (parent: string) => `friend of ${parent}`,
  sharedVia: (media: string) => `shared via ${media}`,
  counts: (opened: number, claimed: number) =>
    `${num(opened)} ${opened === 1 ? 'friend' : 'friends'} opened · ${num(claimed)} claimed`,
  // "₦50 queued"
  amount: (amount: string, status: PayoutStatus) => `${amount} ${ACTIVITY.status[status]}`,
  none: 'No friend has opened their link yet.',
  friendOpen: 'A friend opened the offer',
  friendClaim: { code: 'A friend took claim code PHX-••••', link: 'A friend clicked through to your site' } satisfies Record<RedeemMethod, string>,
  // "…, ₦50 airtime held — No phone number"
  rewardTail: (what: string, amount: string, status: PayoutStatus, reason: string | null) =>
    `${what}, ${amount} airtime ${ACTIVITY.status[status]}${reason ? ` — ${reason}` : ''}`,
  child: (friend: string) => `${friend}, a friend, got a link of their own`,
  childShared: (friend: string, via: string) => `${friend}, a friend, got a link of their own and shared it via ${via}`,
  capped: (shown: number, total: number) => `The newest ${num(shown)} of ${num(total)}.`,
  cappedLink: "The campaign's Recent activity has every one.",
} as const
