import type { Campaign, Workspace } from '@prisma/client'
import type { DefaultValues } from 'react-hook-form'
import type { z } from 'zod'
import { campaignDates, campaignInput, validateCampaign } from '@/lib/campaign-schema'
import { COPY } from '@/lib/copy'
import { CATEGORIES, MARKETS, type Category } from '@/lib/markets'
import { tokens } from '@/lib/tokens'

export type FormValues = z.input<typeof campaignInput>
export type FormDefaults = DefaultValues<FormValues>
export type FieldName = keyof typeof COPY.campaignForm.errors

const DAY = 86_400_000

// YYYY-MM-DD for "today" where the workspace is, not where the server is.
function todayIn(timeZone: string, now: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function newCampaignDefaults(ws: Pick<Workspace, 'name' | 'country'>, now = new Date()): FormDefaults {
  return {
    name: '',
    brand: ws.name,
    country: ws.country,
    headline: '',
    description: '',
    tileColor: tokens.tileColors[0],
    placement: 'card',
    redeemMethod: 'code',
    startsAt: todayIn(MARKETS[ws.country].timezone, now),
    runsForDays: 14,
    rewardLocal: 50,
  }
}

// A flight of exactly 7, 14 or 30 days is a preset; any other ends on a date.
function flightOf(c: Campaign): Pick<FormDefaults, 'runsForDays' | 'endsAt'> {
  const days = Math.round((c.endsAt.getTime() - c.startsAt.getTime()) / DAY)
  return days === 7 || days === 14 || days === 30 ? { runsForDays: days } : { endsAt: c.endsAt.toISOString().slice(0, 10) }
}

export function campaignDefaults(c: Campaign): FormDefaults {
  return {
    name: c.name,
    brand: c.brand,
    country: c.country,
    category: (CATEGORIES as readonly string[]).includes(c.category) ? (c.category as Category) : undefined,
    headline: c.headline,
    description: c.description,
    tileColor: c.tileColor ?? tokens.tileColors[0],
    creativeImageKey: c.creativeImageKey ?? undefined,
    placement: 'card',
    redeemMethod: c.redeemMethod,
    claimCode: c.claimCode ?? undefined,
    linkUrl: c.linkUrl ?? undefined,
    budgetUsd: c.budgetUsd,
    startsAt: c.startsAt.toISOString().slice(0, 10),
    ...flightOf(c),
    rewardLocal: c.rewardLocal,
  }
}

// The first thing standing between the form and "Submit for review", in the order the form asks.
export function formProblem(values: unknown): string | null {
  const parsed = campaignInput.safeParse(values)
  // Credit is checked where the campaign is submitted; the slice-1 form has no credit figures to show.
  if (parsed.success) return validateCampaign(parsed.data, { workspaceType: 'Brand', creditLimitCents: Infinity, creditInUseCents: 0 })
  const field = parsed.error.issues[0]?.path[0] as FieldName
  return COPY.campaignForm.errors[field] ?? COPY.campaignForm.invalid
}

// The exclusive end the card turns into its last day; until the dates are valid, a one-day run from today.
export function previewEndsAt(startsAt: string | undefined, days: number | undefined): Date {
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(startsAt ?? '') && Number.isInteger(days) && (days ?? 0) > 0
  const dates = campaignDates(ok ? startsAt! : new Date().toISOString().slice(0, 10), ok ? days! : 1, 'GH')
  return Number.isNaN(dates.endsAt.getTime()) ? new Date() : dates.endsAt
}

export const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
