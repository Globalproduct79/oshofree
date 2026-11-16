import { describe, expect, it, vi } from 'vitest'
import { accountManagerShown } from '@/lib/workspaces'
import { db } from '@/lib/db'
import { MONEY } from '@/lib/copy-money'
import { approveWorkspace, createWorkspace, reapproveWorkspace, declineWorkspace } from '@/lib/workspaces'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Prompt 10 (carried from Prompt 9's sweep): the prototype's fixed "Obinna A." was never a person. A workspace has no
// account manager until Global approves it, and then it is the Global who did; Global can still name someone else on
// the advertiser page. Billing says who it is, or that one is named on approval.
const person = (email: string, name: string, isGlobalAdmin = false) =>
  db.user.create({ data: { email, name, passwordHash: 'x', isGlobalAdmin } })

describe('account manager', () => {
  it('a new workspace names nobody', async () => {
    const owner = await person('o@x.co', 'Ola Owner')
    const ws = await createWorkspace(owner.id, { name: 'Acme', type: 'Brand', country: 'NG' })
    expect(ws.accountManager).toBeNull()
    expect((await db.workspace.create({ data: { name: 'Bare', type: 'Brand', country: 'NG' } })).accountManager).toBeNull()
  })

  it('the Global who approves a workspace becomes its account manager', async () => {
    const owner = await person('o@x.co', 'Ola Owner')
    const global = await person('g@x.co', 'Gbenga Global', true)
    const ws = await createWorkspace(owner.id, { name: 'Acme', type: 'Brand', country: 'NG' })
    const approved = await approveWorkspace(ws.id, global.id)
    expect(approved.accountManager).toBe('Gbenga Global')
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).accountManager).toBe('Gbenga Global')
  })

  it('an approval keeps a manager Global already named; a declined workspace names whoever approves it later', async () => {
    const owner = await person('o@x.co', 'Ola Owner')
    const other = await person('o2@x.co', 'Obi Owner')
    const first = await person('g1@x.co', 'First Global', true)
    const second = await person('g2@x.co', 'Second Global', true)
    const named = await createWorkspace(owner.id, { name: 'Named', type: 'Brand', country: 'NG' })
    await db.workspace.update({ where: { id: named.id }, data: { accountManager: 'Ada E.' } })
    expect((await approveWorkspace(named.id, first.id)).accountManager).toBe('Ada E.')

    const again = await createWorkspace(other.id, { name: 'Again', type: 'Brand', country: 'NG' })
    await declineWorkspace(again.id, first.id, 'No licence')
    expect((await db.workspace.findUniqueOrThrow({ where: { id: again.id } })).accountManager).toBeNull()
    expect((await reapproveWorkspace(again.id, second.id)).accountManager).toBe('Second Global')
  })

  it("Billing shows the manager's name, or that one is named when Global approves the workspace", () => {
    expect(accountManagerShown('Gbenga Global')).toBe('Gbenga Global')
    expect(accountManagerShown(null)).toBe(MONEY.billing.accountManagerNone)
    expect(accountManagerShown('   ')).toBe(MONEY.billing.accountManagerNone)
  })
})
