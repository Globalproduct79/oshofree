import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { markStatementPaidAction, setShareAction } from '@/app/admin/settlement/actions'
import SettlementPage from '@/app/admin/settlement/page'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { markStatementPaid } from '@/lib/money'
import { currentShare } from '@/lib/rates'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const NOT_FOUND = /NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404/

async function signIn(isGlobalAdmin: boolean) {
  const user = await db.user.create({ data: { email: 'u@x.test', name: 'U', passwordHash: 'x', isGlobalAdmin } })
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id, isGlobalAdmin }, expires: '' } as never)
  return user
}

async function world() {
  const phoenix = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix Browser', apiKeyHash: 'x' } })
  const ws = await db.workspace.create({ data: { name: 'Kola', type: 'Brand', country: 'NG', status: 'approved' } })
  const c = await db.campaign.create({
    data: {
      workspaceId: ws.id, name: 'C', brand: 'K', country: 'NG', category: 'Food & drink', headline: 'h', description: 'd',
      placement: 'card', redeemMethod: 'code', budgetUsd: 100, shareRewardLabel: 'r', status: 'live',
      startsAt: new Date('2026-10-01T00:00:00Z'), endsAt: new Date('2026-12-30T00:00:00Z'),
    },
  })
  const row = (amountCents: number, iso: string) =>
    db.ledgerEntry.create({ data: { workspaceId: ws.id, campaignId: c.id, kind: 'delivery', amountCents, at: new Date(iso), description: 'x' } })
  await row(-10000, '2026-10-10T10:00:00Z')
  await row(-20000, '2026-11-10T10:00:00Z')
  return { phoenix, c }
}

const render = async (month?: string) => renderToStaticMarkup(await SettlementPage({ searchParams: Promise.resolve({ month }) }))

describe('/admin/settlement', () => {
  it('is refused to a signed-in non-admin, page and actions', async () => {
    await signIn(false)
    await expect(Promise.resolve().then(() => SettlementPage({}))).rejects.toMatchObject({ digest: expect.stringMatching(NOT_FOUND) })
    await expect(setShareAction(0.5)).rejects.toMatchObject({ digest: expect.stringMatching(NOT_FOUND) })
    await expect(markStatementPaidAction('x')).rejects.toMatchObject({ digest: expect.stringMatching(NOT_FOUND) })
  })

  it('shows the KPIs of the selected month only, and the markets in order with zeros', async () => {
    await signIn(true)
    await world()
    const oct = await render('2026-10')
    expect(oct).toContain('$100')
    expect(oct).toContain('$55')
    expect(oct).toContain('$45')
    expect(oct).toContain('55%')
    expect(oct).not.toContain('$200')
    const nov = await render('2026-11')
    expect(nov).toContain('$200')
    expect(nov).toContain('$110')
    const order = ['Nigeria', 'Kenya', 'Ghana', 'Tanzania', 'Senegal'].map((n) => nov.indexOf(`<b>${n}</b>`))
    expect(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1]))).toBe(true)
    expect(nov).toContain('Statement by market')
    expect(nov).toContain('Phoenix share of delivery charges')
  })

  it('a share edit inserts a new row, keeps the old, and 1.5 gives the toast; a closed month keeps its share', async () => {
    await signIn(true)
    const { phoenix } = await world()
    await db.channelShare.create({ data: { channelId: phoenix.id, share: 0.4, effectiveFrom: new Date('2026-01-01T00:00:00Z') } })
    expect(await setShareAction(1.5)).toEqual({ error: 'Enter a share between 0 and 1.' })
    expect(await setShareAction(Number.NaN)).toHaveProperty('error')
    expect(await db.channelShare.count()).toBe(1)
    expect(await setShareAction(0.7)).toHaveProperty('toast')
    expect(await db.channelShare.count()).toBe(2)
    expect(await currentShare(phoenix.id, new Date('2026-06-01T00:00:00Z'))).toBe(0.4)
    // October ended before the new share took effect.
    const oct = await render('2026-10')
    expect(oct).toContain('40%')
    expect(oct).toContain('$40')
    expect(await render()).toContain('70%')
  })

  it('lists past statements from rows, and Mark paid is idempotent', async () => {
    const admin = await signIn(true)
    const { phoenix } = await world()
    expect(await render()).toContain('No statements yet.')
    const s = await db.settlementStatement.create({ data: { channelId: phoenix.id, period: new Date('2026-10-01T00:00:00Z'), amountCents: 5500 } })
    const html = await render()
    expect(html).toContain('Oct 2026')
    expect(html).toContain('$55')
    expect(html).toContain('Open')
    expect(html).toContain('Mark paid')
    expect(await markStatementPaidAction(s.id)).toEqual({ toast: 'Statement marked paid' })
    const first = await db.settlementStatement.findUniqueOrThrow({ where: { id: s.id } })
    expect(first.status).toBe('paid')
    await markStatementPaid(s.id, admin.id, new Date('2030-01-01T00:00:00Z'))
    expect((await db.settlementStatement.findUniqueOrThrow({ where: { id: s.id } })).paidAt).toEqual(first.paidAt)
    expect(await db.auditEvent.count({ where: { action: 'statement.paid' } })).toBe(1)
    const after = await render()
    expect(after).toContain('Paid')
    expect(after).not.toContain('Mark paid')
  })
})
