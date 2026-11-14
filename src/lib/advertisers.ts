import 'server-only'
import type { AuditEvent, Prisma, WorkspaceStatus, WorkspaceType } from '@prisma/client'
import { ADVERTISERS, AUDIT_ACTION } from '@/lib/copy-advertisers'
import { STATUS_LABEL } from '@/lib/copy-components'
import { periodLabel } from '@/lib/copy-money'
import { db } from '@/lib/db'
import { fd, loc, localAmount, usd } from '@/lib/format'
import { isCountry, MARKETS, type Country } from '@/lib/markets'
import { creditSummary, invoiceStatus, type InvoiceDisplayStatus } from '@/lib/money'
import { workspaceCards } from '@/lib/reports'
import type { LiveCard } from '@/lib/review'
import { workspaceStatusBox } from '@/lib/workspaces'

// Platform › Advertisers (GLB §2.2) and its workspace detail (spec §6.1, §6.5, §6.14.6), as data.

const D = ADVERTISERS.detail
export const HISTORY_ROWS = 50

// The first owner, as Review's "New advertisers" names them.
const OWNER = {
  members: {
    where: { role: 'Owner' },
    orderBy: { user: { createdAt: 'asc' } },
    take: 1,
    select: { user: { select: { name: true } } },
  },
} satisfies Prisma.WorkspaceInclude

export type AdvertiserRow = {
  id: string
  name: string
  owner: string | null
  type: WorkspaceType
  country: Country
  status: WorkspaceStatus
  campaigns: number
  live: number
  creditLimitCents: number
  inUseCents: number
  outstandingCents: number
}

// One row per workspace, whatever its status, oldest first. In use and outstanding are the money module's own
// figures: one creditSummary per workspace, all at once.
export async function advertiserRows(): Promise<AdvertiserRow[]> {
  const [workspaces, counts] = await Promise.all([
    db.workspace.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: OWNER }),
    db.campaign.groupBy({ by: ['workspaceId', 'status'], _count: { _all: true } }),
  ])
  const credit = await Promise.all(workspaces.map((w) => creditSummary(w.id)))
  return workspaces.map((w, i) => {
    const mine = counts.filter((c) => c.workspaceId === w.id)
    return {
      id: w.id,
      name: w.name,
      owner: w.members[0]?.user.name ?? null,
      type: w.type,
      country: w.country,
      status: w.status,
      campaigns: mine.reduce((n, c) => n + c._count._all, 0),
      live: mine.find((c) => c.status === 'live')?._count._all ?? 0,
      creditLimitCents: w.creditLimitCents,
      inUseCents: credit[i].inUseCents,
      outstandingCents: credit[i].outstandingCents,
    }
  })
}

export type AdvertiserInvoice = {
  id: string
  number: string
  period: string
  status: InvoiceDisplayStatus
  // "—" once paid.
  due: string
  amountCents: number
  local: string
  // Due and overdue invoices take "Mark paid".
  payable: boolean
}

export type AdvertiserRequest = { id: string; requester: string; note: string | null; sent: string }

export type AdvertiserEvent = { id: string; at: string; actor: string; action: string; change: string }

export type AdvertiserDetail = {
  id: string
  name: string
  type: WorkspaceType
  country: Country
  status: WorkspaceStatus
  declineReason: string | null
  owner: string | null
  since: string
  registrationNumber: string | null
  accountManager: string
  termsDays: number
  creditLimitCents: number
  cards: LiveCard[]
  invoices: AdvertiserInvoice[]
  requests: AdvertiserRequest[]
  history: AdvertiserEvent[]
}

// ---- History: an audit row as one line ----

type Fields = Record<string, Prisma.JsonValue>
const fields = (v: Prisma.JsonValue | null): Fields => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Fields) : {})

// The fields whose before → after History spells out, in this order.
const SHOWN = ['creditLimitCents', 'type', 'country', 'status', 'rewardLocal', 'name', 'registrationNumber', 'accountManager']
const STATUS: Record<string, string> = { ...STATUS_LABEL, open: 'Open', dismissed: 'Dismissed' }

function show(key: string, v: Prisma.JsonValue, country: Country): string {
  if (v === null || v === '') return '—'
  if (key === 'creditLimitCents' && typeof v === 'number') return usd(v)
  if (key === 'rewardLocal' && typeof v === 'number') return localAmount(v, country)
  if (key === 'country' && isCountry(v)) return MARKETS[v].name
  if (key === 'status' && typeof v === 'string') return STATUS[v] ?? v
  return String(v)
}

function change(e: AuditEvent, country: Country, invoiceNumbers: Map<string, string>): string {
  const before = fields(e.before)
  const after = fields(e.after)
  const parts: string[] = []
  const number = e.targetType === 'Invoice' ? (invoiceNumbers.get(e.targetId) ?? after.number) : null
  if (typeof number === 'string') parts.push(number)
  if (e.action === 'invoice.issue' && typeof after.amountCents === 'number') parts.push(usd(after.amountCents))
  for (const k of SHOWN) {
    if (k in before && k in after && before[k] !== after[k]) parts.push(`${show(k, before[k], country)} → ${show(k, after[k], country)}`)
  }
  return parts.join(' · ')
}

// ---- Detail ----

export async function advertiserDetail(id: string, now: Date): Promise<AdvertiserDetail | null> {
  const ws = await db.workspace.findUnique({ where: { id }, include: OWNER })
  if (!ws) return null
  const { timezone } = MARKETS[ws.country]
  const [cards, invoices, requests, events] = await Promise.all([
    workspaceCards(id, now),
    db.invoice.findMany({ where: { workspaceId: id }, orderBy: [{ period: 'desc' }, { number: 'desc' }] }),
    db.creditRequest.findMany({ where: { workspaceId: id, status: 'open' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    db.auditEvent.findMany({
      where: { workspaceId: id },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: HISTORY_ROWS,
      include: { actor: { select: { name: true } } },
    }),
  ])
  const requesters = await db.user.findMany({
    where: { id: { in: requests.map((r) => r.requestedById) } },
    select: { id: true, name: true },
  })
  const names = new Map(requesters.map((u) => [u.id, u.name]))
  const numbers = new Map(invoices.map((i) => [i.id, i.number]))

  return {
    id: ws.id,
    name: ws.name,
    type: ws.type,
    country: ws.country,
    status: ws.status,
    declineReason: ws.declineReason,
    owner: ws.members[0]?.user.name ?? null,
    since: workspaceStatusBox(ws).since,
    registrationNumber: ws.registrationNumber,
    accountManager: ws.accountManager,
    termsDays: ws.termsDays,
    creditLimitCents: ws.creditLimitCents,
    cards: cards.map((c) => ({ ...c, href: `/app/campaigns/${c.id}` })),
    invoices: invoices.map((inv) => {
      const status = invoiceStatus(inv, now)
      return {
        id: inv.id,
        number: inv.number,
        period: periodLabel(inv.period, timezone),
        status,
        due: status === 'paid' ? D.notDue : fd(inv.dueAt, timezone),
        amountCents: inv.amountCents,
        local: loc(inv.amountCents, ws.country, Number(inv.fxPerUsd)),
        payable: status === 'due' || status === 'overdue',
      }
    }),
    requests: requests.map((r) => ({
      id: r.id,
      requester: names.get(r.requestedById) ?? D.noOwner,
      note: r.note?.trim() || null,
      sent: fd(r.createdAt, timezone),
    })),
    history: events.map((e) => ({
      id: e.id,
      at: fd(e.at, timezone),
      actor: e.actor?.name ?? D.system,
      action: AUDIT_ACTION[e.action] ?? e.action,
      change: change(e, ws.country, numbers),
    })),
  }
}
