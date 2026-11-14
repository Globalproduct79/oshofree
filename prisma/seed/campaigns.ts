import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Campaign } from '@prisma/client'
import type { CampaignInput } from '@/lib/campaign-schema'
import { approveCampaign, createCampaign, submitCampaign } from '@/lib/campaigns'
import { tokens } from '@/lib/tokens'
import { uploadDir } from '@/lib/upload-dir'
import type { Clock, Timeline } from './timeline'
import type { People, PersonKey } from './users'
import type { WorkspaceKey, Workspaces } from './workspaces'

// ADV "Object model → Seed campaigns": the nine campaigns, descriptions verbatim. Flights are relative to the
// run day as the inventory's are to 13 Nov 2026, except the two that have ended: they are anchored in last month,
// so its close always has their charges to invoice (Kola's INV-0041, MediaSpec's INV-0044) on any run day.
// Jackpot 10 runs in Senegal (spec §6.13), and its description says so.

export type CampaignKey = 'buy2' | 'august' | 'draw' | 'supa10' | 'foot' | 'weekend' | 'kwik' | 'jackpot' | 'pesa'
export type SeedStatus = 'live' | 'ended' | 'review' | 'paused'

// A moment: `hour` o'clock in the campaign's market, `beforeStart` days before its first day; or hours before now.
type Moment = { beforeStart: number; hour: number } | { hoursAgo: number }

type Offer = Omit<CampaignInput, 'startsAt' | 'runsForDays' | 'endsAt' | 'termsAccepted' | 'creativeImageKey'>

export type SeedCampaign = {
  key: CampaignKey
  workspace: WorkspaceKey
  // Who submits it.
  by: PersonKey
  offer: Offer
  creative?: Creative
  // The flight: its first day (days from today, or worked out from the clock) and its length in days. 7, 14 and
  // 30 are the form's presets; any other length is a custom flight with an end date.
  start: number | ((clock: Clock) => number)
  days: number
  status: SeedStatus
  // ADV "Seed generator": the share of the budget it has been planned to deliver by now (ended: all of it).
  progress: number
  submitted: Moment
  approved?: Moment
}

const COLOR = (hex: string) => {
  if (!(tokens.tileColors as readonly string[]).includes(hex)) throw new Error(`${hex} is not a tile colour`)
  return hex
}

// The prototype's embedded creatives (GLB §2.7), copied into UPLOAD_DIR under fixed keys.
type Creative = 'supa10' | 'metro' | 'jackpot10' | 'pariez'
const CREATIVE_KEYS: Record<Creative, string> = {
  supa10: '5eed0000-0000-4000-8000-000000000001.jpg',
  pariez: '5eed0000-0000-4000-8000-000000000002.jpg',
  metro: '5eed0000-0000-4000-8000-000000000003.jpg',
  jackpot10: '5eed0000-0000-4000-8000-000000000004.jpg',
}

export async function placeCreatives(): Promise<void> {
  const from = fileURLToPath(new URL('./creatives/', import.meta.url))
  const to = uploadDir()
  await mkdir(to, { recursive: true })
  for (const [name, key] of Object.entries(CREATIVE_KEYS)) await copyFile(path.join(from, `${name}.jpg`), path.join(to, key))
}

// August multipack's 14-day flight sits inside last month: a month before the run day, moved forward or back
// as little as it takes to start on or after the 1st and end by the month's last day.
const augustStart = (clock: Clock) => {
  const lastDay = clock.firstOfMonth(0) - 1
  return Math.min(Math.max(-31, clock.firstOfMonth(-1)), lastDay - 14)
}

// Jackpot 10's 18 days start three weeks before the run day, or later in last month when that leaves it fewer
// than its last four days there: at least four days are charged last month, and it ended three or more days ago.
const jackpotStart = (clock: Clock) => Math.min(-21, clock.firstOfMonth(0) - 1 - 4)

export const CAMPAIGNS: SeedCampaign[] = [
  {
    key: 'buy2', workspace: 'kola', by: 'ada', start: -6, days: 14, status: 'live', progress: 0.48,
    submitted: { beforeStart: 3, hour: 10 }, approved: { beforeStart: 2, hour: 11 },
    offer: {
      name: 'Buy 2 get 1 — November', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: 'Buy 2 bottles, get 1 free',
      description: 'Buy any two 50cl Kola Bright at a participating store and get a third free. Show your claim code at the till.',
      tileColor: COLOR('#FF5A1F'), placement: 'featured', redeemMethod: 'code', budgetUsd: 300, rewardLocal: 50,
    },
  },
  {
    key: 'august', workspace: 'kola', by: 'tunde', start: augustStart, days: 14, status: 'ended', progress: 1,
    submitted: { beforeStart: 3, hour: 10 }, approved: { beforeStart: 2, hour: 11 },
    offer: {
      name: 'August multipack 15% off', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: '15% off 6-packs', description: 'At Shoprite and Justrite outlets nationwide.',
      tileColor: COLOR('#0F766E'), placement: 'card', redeemMethod: 'code', budgetUsd: 150, rewardLocal: 0,
    },
  },
  {
    key: 'draw', workspace: 'kola', by: 'tunde', start: 3, days: 14, status: 'review', progress: 0,
    submitted: { hoursAgo: 26 },
    offer: {
      name: 'December draw teaser', brand: 'Kola Bright', country: 'NG', category: 'Food & drink',
      headline: 'Win a year of Kola Bright', description: 'Enter the December draw with any purchase. NLRC approval no. 2026/0413.',
      tileColor: COLOR('#7C3AED'), placement: 'video', redeemMethod: 'link', linkUrl: 'https://kolabright.example/draw',
      budgetUsd: 400, rewardLocal: 100,
    },
  },
  {
    key: 'supa10', workspace: 'media', by: 'chidi', start: -5, days: 14, status: 'live', progress: 0.46, creative: 'supa10',
    submitted: { beforeStart: 3, hour: 10 }, approved: { beforeStart: 2, hour: 11 },
    offer: {
      name: 'Supa10 Jackpot — Kenya', brand: '777Bet', country: 'KE', category: 'Betting',
      headline: 'Supa10 Jackpot — KSh 5M kwa buku tu',
      description: 'Predict 10 matches for KSh 100 and win a share of KSh 5,000,000. Draws every weekend. 18+. BCLB licence 0000123.',
      tileColor: COLOR('#111827'), placement: 'featured', redeemMethod: 'link', linkUrl: 'https://777bet.co.ke', budgetUsd: 800, rewardLocal: 10,
    },
  },
  {
    key: 'foot', workspace: 'media', by: 'chidi', start: -4, days: 23, status: 'live', progress: 0.3, creative: 'pariez',
    submitted: { beforeStart: 3, hour: 10 }, approved: { beforeStart: 2, hour: 11 },
    offer: {
      name: 'Foot Gabal-Lena — Senegal', brand: 'Pariez Cash', country: 'SN', category: 'Betting',
      headline: 'Ton 1er pari 100% remboursé',
      description: "Premier pari gagnant ou remboursé en freebet jusqu'à 2 000 F sur le sport et le virtuel. Du 07 au 30 novembre. 18+. Licence LONASE 2026-118.",
      tileColor: COLOR('#B45309'), placement: 'card', redeemMethod: 'link', linkUrl: 'https://pariezcash.com', budgetUsd: 450, rewardLocal: 100,
    },
  },
  {
    key: 'weekend', workspace: 'media', by: 'dolapo', start: 1, days: 14, status: 'review', progress: 0, creative: 'metro',
    submitted: { hoursAgo: 3 },
    offer: {
      name: 'Weekend cashback — Tanzania', brand: '777Bet Metro', country: 'TZ', category: 'Betting',
      headline: 'Pata 10% ya mikeka uliyopoteza',
      description: 'Weka dau wikiendi hii. Ukikosa, unarudishiwa 10% ya mikeka yako Jumatatu. 18+. GBT licence TZ-0921.',
      tileColor: COLOR('#BE185D'), placement: 'splash', redeemMethod: 'link', linkUrl: 'https://777bet.tz', budgetUsd: 600, rewardLocal: 500,
    },
  },
  {
    key: 'kwik', workspace: 'media', by: 'chidi', start: -4, days: 30, status: 'paused', progress: 0.3,
    submitted: { beforeStart: 3, hour: 12 }, approved: { beforeStart: 2, hour: 12 },
    offer: {
      name: 'Kwik ₦1m draw', brand: 'Kwik Bank', country: 'NG', category: 'Banking & fintech',
      headline: 'Deposit ₦5,000, enter the ₦1m draw',
      description: 'Fund your Kwik account with ₦5,000 or more this month and you are automatically entered.',
      tileColor: COLOR('#2B5FD9'), placement: 'card', redeemMethod: 'link', linkUrl: 'https://kwik.example', budgetUsd: 600, rewardLocal: 50,
    },
  },
  {
    key: 'jackpot', workspace: 'media', by: 'dolapo', start: jackpotStart, days: 18, status: 'ended', progress: 1, creative: 'jackpot10',
    submitted: { beforeStart: 3, hour: 10 }, approved: { beforeStart: 2, hour: 11 },
    offer: {
      name: 'Jackpot 10 — Guinea-Bissau', brand: 'Jackpot 10', country: 'SN', category: 'Betting',
      headline: 'O Jackpot 10 está de volta',
      description: 'Adivinhe os resultados para tentar ganhar a sua parte nos 2.000.000 FCFA. Bilhete por 200 FCFA. 18+. Oferta válida no Senegal.',
      tileColor: COLOR('#111827'), placement: 'card', redeemMethod: 'link', linkUrl: 'https://jackpot10.example', budgetUsd: 200, rewardLocal: 100,
    },
  },
  {
    key: 'pesa', workspace: 'pesa', by: 'wanjiru', start: -5, days: 14, status: 'live', progress: 0.6,
    submitted: { beforeStart: 3, hour: 15 }, approved: { beforeStart: 2, hour: 12 },
    offer: {
      name: 'KSh 50 cashback on first top-up', brand: 'Pesa Link', country: 'KE', category: 'Banking & fintech',
      headline: 'KSh 50 cashback on first airtime top-up',
      description: 'Top up any network from Pesa Link and get KSh 50 back within 24 hours.',
      tileColor: COLOR('#0F766E'), placement: 'card', redeemMethod: 'link', linkUrl: 'https://pesalink.example', budgetUsd: 150, rewardLocal: 5,
    },
  },
]

const PRESETS = [7, 14, 30]

// The flight as days from today: its first day and the day it ends (exclusive, the market's midnight).
export function flightOf(s: SeedCampaign, clock: Clock): { start: number; end: number } {
  const start = typeof s.start === 'number' ? s.start : s.start(clock)
  return { start, end: start + s.days }
}

export const momentOf = (clock: Clock, s: SeedCampaign, m: Moment): Date =>
  'hoursAgo' in m ? clock.hoursAgo(m.hoursAgo) : clock.at(flightOf(s, clock).start - m.beforeStart, s.offer.country, m.hour)

// The campaign as the New campaign form would send it on its submit day.
function input(s: SeedCampaign, clock: Clock): CampaignInput {
  const { start, end } = flightOf(s, clock)
  const flight = PRESETS.includes(s.days) ? { runsForDays: s.days as 7 | 14 | 30 } : { endsAt: clock.date(end) }
  return {
    ...s.offer,
    ...(s.creative && { creativeImageKey: CREATIVE_KEYS[s.creative] }),
    startsAt: clock.date(start),
    ...flight,
    termsAccepted: true,
  }
}

export type Made = Partial<Record<CampaignKey, Campaign>>

// Each campaign is created and submitted three days before its start (snapshotting Phoenix's CPM and the market's
// FX, and telling its workspace and Global), then approved by Global two days before its start: scheduled, until
// the daily job starts it at the market's midnight. Review campaigns wait for Global.
export function planCampaigns(timeline: Timeline, workspaces: Workspaces, people: People, clock: Clock): Made {
  const made: Made = {}
  for (const s of CAMPAIGNS) {
    timeline.add(momentOf(clock, s, s.submitted), `submit ${s.offer.name}`, async () => {
      const draft = await createCampaign(workspaces[s.workspace].id, input(s, clock))
      made[s.key] = await submitCampaign(draft.id, people[s.by].id, momentOf(clock, s, s.submitted))
    })
    const approved = s.approved
    if (!approved) continue
    timeline.add(momentOf(clock, s, approved), `approve ${s.offer.name}`, async () => {
      made[s.key] = await approveCampaign(made[s.key]!.id, people.admin.id, momentOf(clock, s, approved))
    })
  }
  return made
}
