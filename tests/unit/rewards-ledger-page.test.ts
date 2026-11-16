import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { rejectPayoutAction, releasePayoutAction, setFraudRuleAction, topUpAction } from '@/app/admin/rewards/actions'
import RewardsLedgerPage from '@/app/admin/rewards/page'
import { submitGuard } from '@/components/platform/EnterLink'
import { inAppPath } from '@/lib/nav'
import { rewardLineHref } from '@/lib/activity-keys'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const NOT_FOUND = /NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK;404/

async function signIn(isGlobalAdmin: boolean) {
  const user = await db.user.create({ data: { email: 'u@x.test', name: 'Ada Global', passwordHash: 'x', isGlobalAdmin } })
  vi.mocked(auth).mockResolvedValue({ user: { id: user.id, isGlobalAdmin }, expires: '' } as never)
  return user
}

const render = async () => renderToStaticMarkup(await RewardsLedgerPage())

async function world(over: { budgetUsd?: number } = {}) {
  const ws = await db.workspace.create({ data: { name: 'Kola Bright', type: 'Brand', country: 'NG', status: 'approved' } })
  const c = await db.campaign.create({
    data: {
      workspaceId: ws.id, name: 'Buy 2 get 1', brand: 'K', country: 'NG', category: 'Food & drink', headline: 'h', description: 'd',
      placement: 'card', redeemMethod: 'code', budgetUsd: over.budgetUsd ?? 100, shareRewardLabel: 'r', status: 'live', rewardLocal: 50,
      startsAt: new Date('2026-10-01T00:00:00Z'), endsAt: new Date('2026-12-30T00:00:00Z'),
    },
  })
  const channel = await db.channel.create({ data: { key: 'phoenix', name: 'Phoenix', apiKeyHash: 'h' } })
  const link = await db.shareLink.create({ data: { campaignId: c.id, channelId: channel.id, code: 'abc1', depth: 1, sharerType: 'Channel', sharerSessionId: 'sess-abcd1234' } as never })
  let k = 0
  const payout = (status: 'queued' | 'sent' | 'held' | 'rejected', amountCents: number, reason: string | null = null, at = new Date()) =>
    db.rewardPayout.create({
      data: {
        campaignId: c.id, workspaceId: ws.id, shareLinkId: link.id, sharerSessionId: 'sess-abcd1234', claimEventKey: `k${++k}`,
        amountLocal: 50, amountCents, status, reason, createdAt: at,
      },
    })
  return { ws, c, payout }
}

describe('/admin/rewards', () => {
  it('is refused to a non-admin, page and actions', async () => {
    await signIn(false)
    await expect(Promise.resolve().then(() => RewardsLedgerPage())).rejects.toMatchObject({ digest: expect.stringMatching(NOT_FOUND) })
    for (const act of [() => topUpAction(5), () => setFraudRuleAction('same_device', false), () => releasePayoutAction('x'), () => rejectPayoutAction('x')]) {
      await expect(act()).rejects.toMatchObject({ digest: expect.stringMatching(NOT_FOUND) })
    }
  })

  it('shows earned, sent, queued pct, low balance and points', async () => {
    await signIn(true)
    const { ws, c, payout } = await world()
    await payout('sent', 30000)
    await payout('queued', 10000)
    await payout('held', 10000, 'no_phone')
    await payout('rejected', 99900, 'cap')
    await payout('sent', 70000, null, new Date('2020-01-01T00:00:00Z'))
    await db.pointsLedger.create({ data: { campaignId: c.id, points: 1500, sharerSessionId: 's' } })
    await db.aggregatorAccount.create({ data: { id: 'reloadly', balanceCents: 49999 } })
    void ws
    const html = await render()
    expect(html).toContain('$500') // earned 50000
    expect(html).toContain('$300') // sent
    expect(html).toContain('40.0% still queued')
    expect(html).toContain('top up soon')
    expect(html).toContain('1.5k')
    expect(html).toContain('10 per successful share')
  })

  it('estimates days of balance at or above $500', async () => {
    await signIn(true)
    const { payout } = await world()
    await payout('sent', 30000)
    await db.aggregatorAccount.create({ data: { id: 'reloadly', balanceCents: 100000 } })
    // 100000 / (30000 / 30) = 100
    expect(await render()).toContain('about 100 days at current rate')
  })

  it('lists campaigns with Paid / Open', async () => {
    await signIn(true)
    const { payout } = await world()
    await payout('sent', 1000)
    const html = await render()
    expect(html).toContain('Buy 2 get 1')
    expect(html).toContain('Kola Bright')
    expect(html).toContain('₦50')
    expect(html).toContain('Open')
  })

  it('top-up refuses 0 and -5, records a top-up with the actor', async () => {
    const admin = await signIn(true)
    expect(await topUpAction(0)).toEqual({ error: 'Enter an amount above zero.' })
    expect(await topUpAction(-5)).toEqual({ error: 'Enter an amount above zero.' })
    expect(await db.aggregatorTopup.count()).toBe(0)
    expect(await topUpAction(1000)).toEqual({ toast: 'Aggregator topped up' })
    const rows = await db.aggregatorTopup.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ amountCents: 100000, byUserId: admin.id })
    const html = await render()
    expect(html).toContain('Recent top-ups')
    expect(html).toContain('Ada Global')
  })

  it('top-up refuses an amount the balance cannot hold, saying so', async () => {
    await signIn(true)
    // $21,474,837 is 2,147,483,700 cents: past the balance's ceiling of 2,147,483,647.
    expect(await topUpAction(21_474_837)).toEqual({ error: 'That top-up is too large.' })
    await db.aggregatorAccount.create({ data: { id: 'reloadly', balanceCents: 2_147_483_600 } })
    expect(await topUpAction(1)).toEqual({ error: 'That top-up is too large.' })
    expect(await db.aggregatorTopup.count()).toBe(0)
    expect((await db.aggregatorAccount.findUniqueOrThrow({ where: { id: 'reloadly' } })).balanceCents).toBe(2_147_483_600)
  })

  it('a fraud toggle persists and audits', async () => {
    const admin = await signIn(true)
    expect(await setFraudRuleAction('same_device', false)).toHaveProperty('toast')
    expect((await db.fraudRule.findUniqueOrThrow({ where: { key: 'same_device' } })).enabled).toBe(false)
    expect(await db.auditEvent.count({ where: { action: 'fraud.rule', actorId: admin.id } })).toBe(1)
    expect(await setFraudRuleAction('nope', true)).toHaveProperty('error')
    expect(await render()).toContain('Same device claims own share')
  })

  it('held rewards: reason label, release, reject, and the cap refusal', async () => {
    await signIn(true)
    const { payout } = await world({ budgetUsd: 100 })
    const a = await payout('held', 500, 'no_phone')
    const html = await render()
    expect(html).toContain('No phone number')
    expect(html).toContain('Phoenix user · ••1234')
    expect(html).toContain('Release')
    expect(await releasePayoutAction(a.id)).toEqual({ toast: 'Reward released' })
    expect((await db.rewardPayout.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('queued')
    const b = await payout('held', 500, 'phone_reuse')
    expect(await rejectPayoutAction(b.id)).toEqual({ toast: 'Reward rejected' })
    expect((await db.rewardPayout.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('rejected')
    expect(await render()).toContain('Nothing held.')
  })

  it("links a held reward's campaign to that reward's line in the campaign's Recent activity", async () => {
    await signIn(true)
    const { c, payout } = await world()
    const a = await payout('held', 500, 'no_phone')
    const html = await render()
    // A form (entering is an audited action), its button reading as the campaign's name.
    expect(html).toMatch(/<form class="enter" action="[^"]*">(<input[^>]*>)*<button type="submit" class="linkbtn" title="See this reward in the campaign&#x27;s Recent activity"><b>Buy 2 get 1<\/b><\/button><\/form>/)
    expect(html).not.toContain(`href="/app/campaigns/${c.id}`)
    // Where it lands: the reward's line, a path entering a workspace may follow.
    expect(rewardLineHref(c.id, a.id)).toBe(`/app/campaigns/${c.id}?line=reward-${a.id}`)
    expect(inAppPath(rewardLineHref(c.id, a.id))).toBe(rewardLineHref(c.id, a.id))
  })

  it('enters the workspace once however often the button is pressed, and works again once a press settles', () => {
    const guard = submitGuard()
    const press = () => {
      let stopped = false
      guard.onSubmit({ preventDefault: () => void (stopped = true) })
      return stopped
    }
    // Pressed three times while the first is on its way: only the first goes.
    expect([press(), press(), press()]).toEqual([false, true, true])
    // The action failed (the form is no longer pending) or the page came back from the cache: it works again, once.
    guard.settle()
    expect([press(), press()]).toEqual([false, true])
    // Settling twice changes nothing.
    guard.settle()
    guard.settle()
    expect([press(), press()]).toEqual([false, true])
  })

  it('release over the cap gives the toast and stays held', async () => {
    await signIn(true)
    const { payout } = await world({ budgetUsd: 1 })
    const a = await payout('held', 1000000, 'platform_cap')
    expect(await releasePayoutAction(a.id)).toEqual({ error: "Over the campaign's reward cap — raise the cap or reject." })
    expect((await db.rewardPayout.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('held')
  })

  it('releasing a rejected payout, or rejecting a released one, says it was already handled and changes nothing', async () => {
    await signIn(true)
    const { payout } = await world()
    const a = await payout('held', 500, 'no_phone')
    expect(await rejectPayoutAction(a.id)).toEqual({ toast: 'Reward rejected' })
    expect(await releasePayoutAction(a.id)).toEqual({ error: 'That reward was already handled.' })
    expect(await rejectPayoutAction(a.id)).toEqual({ error: 'That reward was already handled.' })
    expect((await db.rewardPayout.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('rejected')
    const b = await payout('held', 500, 'no_phone')
    expect(await releasePayoutAction(b.id)).toEqual({ toast: 'Reward released' })
    expect(await rejectPayoutAction(b.id)).toEqual({ error: 'That reward was already handled.' })
    expect(await releasePayoutAction(b.id)).toEqual({ error: 'That reward was already handled.' })
    expect((await db.rewardPayout.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('queued')
  })

  it('shows Paid when every reward line of a campaign is on a paid invoice', async () => {
    await signIn(true)
    const { ws, c, payout } = await world()
    await payout('sent', 1000)
    const invoice = await db.invoice.create({
      data: { workspaceId: ws.id, number: 'INV-1', period: new Date('2026-11-15T12:00:00Z'), amountCents: 1000, fxPerUsd: 1500, country: 'NG', status: 'paid', issuedAt: new Date(), dueAt: new Date(), paidAt: new Date() },
    })
    await db.ledgerEntry.create({ data: { workspaceId: ws.id, campaignId: c.id, kind: 'reward', amountCents: -1000, description: 'x', invoiceId: invoice.id } })
    const html = await render()
    expect(html).toContain('Paid')
    expect(html).not.toContain('>Open<')
  })
})
