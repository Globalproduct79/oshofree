import 'server-only'
import { STATUS_LABEL } from '@/lib/copy-components'
import { periodLabel } from '@/lib/copy-money'
import { db } from '@/lib/db'
import { MARKETS } from '@/lib/markets'

export type Hit = { id: string; label: string; sub: string; href: string }
export type CampaignHit = Hit & { workspaceId: string }
export type WorkspaceSearch = { campaigns: Hit[]; invoices: Hit[]; people: Hit[] }
export type PlatformSearch = { workspaces: Hit[]; campaigns: CampaignHit[] }

const LIMIT = 5
const MIN = 2
const has = (q: string) => ({ contains: q, mode: 'insensitive' as const })

export async function searchWorkspace(workspaceId: string, raw: string): Promise<WorkspaceSearch> {
  const q = raw.trim()
  if (q.length < MIN) return { campaigns: [], invoices: [], people: [] }
  const [campaigns, invoices, members] = await Promise.all([
    db.campaign.findMany({
      where: { workspaceId, OR: [{ name: has(q) }, { headline: has(q) }, { brand: has(q) }] },
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
    }),
    db.invoice.findMany({ where: { workspaceId, number: has(q) }, orderBy: { period: 'desc' }, take: LIMIT }),
    db.workspaceMember.findMany({
      where: { workspaceId, user: { OR: [{ name: has(q) }, { email: has(q) }] } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { user: { name: 'asc' } },
      take: LIMIT,
    }),
  ])
  return {
    campaigns: campaigns.map((c) => ({
      id: c.id,
      label: c.name,
      sub: `${c.headline} · ${STATUS_LABEL[c.status]}`,
      href: `/app/campaigns/${c.id}`,
    })),
    // An invoice's month in the country it was issued under.
    invoices: invoices.map((i) => ({ id: i.id, label: i.number, sub: periodLabel(i.period, MARKETS[i.country].timezone), href: '/app/invoices' })),
    people: members.map((m) => ({ id: m.userId, label: m.user.name, sub: m.user.email, href: '/app/people' })),
  }
}

export async function searchPlatform(raw: string): Promise<PlatformSearch> {
  const q = raw.trim()
  if (q.length < MIN) return { workspaces: [], campaigns: [] }
  const [workspaces, campaigns] = await Promise.all([
    db.workspace.findMany({ where: { name: has(q) }, orderBy: { name: 'asc' }, take: LIMIT }),
    db.campaign.findMany({
      where: { OR: [{ name: has(q) }, { headline: has(q) }, { brand: has(q) }] },
      include: { workspace: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
    }),
  ])
  return {
    workspaces: workspaces.map((w) => ({
      id: w.id,
      label: w.name,
      sub: `${w.type} · ${w.country} · ${w.status}`,
      href: `/admin/advertisers/${w.id}`,
    })),
    campaigns: campaigns.map((c) => ({
      id: c.id,
      label: c.name,
      sub: `${c.workspace.name} · ${STATUS_LABEL[c.status]}`,
      href: `/app/campaigns/${c.id}`,
      workspaceId: c.workspaceId,
    })),
  }
}
