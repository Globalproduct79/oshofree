import { fd, fmt, usd } from '@/lib/format'

type Item = { title: string; detail?: string }

const dayCount = (n: number) => (n === 1 ? '1 day' : `${n} days`)

export const NOTIFY = {
  inReview: (name: string): Item => ({ title: `${name} is in review`, detail: 'Global usually decides within one working day' }),
  live: (name: string): Item => ({ title: `${name} is live on Phoenix` }),
  // The start day as the campaign's market reads it.
  scheduled: (name: string, start: Date, timeZone = 'UTC'): Item => ({ title: `${name} is scheduled for ${fd(start, timeZone)}` }),
  rejected: (name: string, reason: string): Item => ({ title: `${name} was not approved`, detail: reason }),
  // A revised offer on a running campaign (spec §6.14.3): the campaign never stopped, so no "is live".
  revisionApproved: (name: string): Item => ({ title: `${name}'s revised offer is approved` }),
  revisionRejected: (name: string, reason: string): Item => ({ title: `${name}'s revised offer was not approved`, detail: reason }),
  workspaceApproved: (): Item => ({ title: 'Your workspace is approved', detail: 'Submit campaigns any time' }),
  workspaceDeclined: (reason: string): Item => ({ title: 'Your workspace was declined', detail: reason }),
  creditLimit: (cents: number): Item => ({ title: `Your credit limit is now ${usd(cents)}` }),
  ended: (name: string, impressions: number, openRate: string, outOfBudget = false): Item => ({
    title: `${name} ended`,
    detail: outOfBudget ? 'budget fully delivered' : `${fmt(impressions)} impressions · ${openRate} open rate`,
  }),
  pausedOverCredit: (name: string): Item => ({
    title: `${name} paused — credit limit reached`,
    detail: 'pay an open invoice or ask Global to raise the limit',
  }),
  // The daily job's pace warning (controller copy): `days` is how far from the flight the budget lands.
  paceFast: (name: string, days: number): Item => ({
    title: `${name} is delivering faster than planned`,
    detail: `budget will finish ~${dayCount(days)} early`,
  }),
  paceSlow: (name: string, days: number): Item => ({
    title: `${name} is delivering slower than planned`,
    detail: `budget will last ~${dayCount(days)} longer`,
  }),
  // Monday's digest of the week before (controller copy).
  weekly: (live: number, impressions: number, spendCents: number): Item => ({
    title: 'Your week on Phoenix',
    detail: `${live} live · ${fmt(impressions)} impressions · ${usd(spendCents)} spent`,
  }),
  needsReview: (campaignName: string, workspaceName: string): Item => ({
    title: `${campaignName} needs review`,
    detail: workspaceName,
  }),
  wantsToJoin: (workspaceName: string, type: string): Item => ({
    title: `${workspaceName} wants to join`,
    detail: `New ${type.toLowerCase()} workspace`,
  }),
}
