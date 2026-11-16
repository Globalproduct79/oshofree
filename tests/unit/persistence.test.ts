import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signUpAction } from '@/app/(auth)/sign-up/actions'
import { topUpAction } from '@/app/admin/rewards/actions'
import { approveCampaignAction, approveWorkspaceAction } from '@/app/admin/review/actions'
import { POST as upload } from '@/app/api/upload/route'
import { POST as phoenixShare } from '@/app/api/v1/share/route'
import { submitAction } from '@/app/app/(console)/campaigns/actions'
import { inviteAction } from '@/app/app/(console)/people/actions'
import { createWorkspaceAction } from '@/app/app/new-workspace/actions'
import { POST as claimOnLanding } from '@/app/o/[code]/claim/route'
import { GET as openLanding } from '@/app/o/[code]/route'
import { advertiserRows as advertiserRowsBefore } from '@/lib/advertisers'
import { auth } from '@/lib/auth'
import { bootstrap } from '@/lib/bootstrap'
import { todayIn } from '@/lib/campaign-schema'
import { db } from '@/lib/db'
import { sendQueuedPayouts } from '@/lib/rewards'
import { tokens } from '@/lib/tokens'

// Prompt 9's proof that user actions update persistent records and the pages read them back: one action per entity —
// a workspace, an invitation, a campaign with its uploaded creative, a friend's claim on the landing page, the reward it
// pays — each through the server action or route the button or link calls. Then the app "restarts": the Prisma client
// is dropped and every page's data function is loaded again over a NEW client (a new connection), and each record is
// there, as the page would show it.

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next-auth', () => ({ AuthError: class AuthError extends Error {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// The browser's cookie jar: the active workspace survives between actions, as in the app.
const cookies = vi.hoisted(() => new Map<string, string>())
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (k: string) => (cookies.has(k) ? { value: cookies.get(k) } : undefined),
    set: (k: string, v: string) => void cookies.set(k, v),
    delete: (k: string) => void cookies.delete(k),
  }),
}))

const REDIRECT = { digest: expect.stringContaining('NEXT_REDIRECT') }
const PNG = new Uint8Array(2048)
PNG.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const signInAs = (u: { id: string; isGlobalAdmin: boolean }) =>
  vi.mocked(auth).mockResolvedValue({ user: { id: u.id, isGlobalAdmin: u.isGlobalAdmin }, expires: '' } as never)

// A real browser request carries Content-Length; one built from FormData does not, so add it (as upload-routes does).
async function uploadCreative(file: File) {
  const picked = new FormData()
  picked.set('placement', 'card')
  picked.set('file', file)
  const draft = new Request('http://localhost/api/upload', { method: 'POST', body: picked })
  const bytes = await draft.arrayBuffer()
  const headers = { 'content-type': draft.headers.get('content-type')!, 'content-length': String(bytes.byteLength) }
  const res = await upload(new Request('http://localhost/api/upload', { method: 'POST', body: bytes, headers }))
  expect(res.status).toBe(200)
  return (await res.json()) as { key: string; url: string }
}

let dir: string
beforeEach(async () => {
  cookies.clear()
  dir = await mkdtemp(path.join(tmpdir(), 'oshofree-persist-'))
  vi.stubEnv('UPLOAD_DIR', dir)
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(dir, { recursive: true, force: true })
})

describe('what a user does is stored, and every page reads it back after a restart', () => {
  it('a workspace, an invitation, a campaign with its creative, a claim on the landing page and the reward it pays', async () => {
    // What production has before anyone signs in: the Global user, Phoenix (live, its key), rates, FX, fraud rules.
    const boot = await bootstrap({ adminEmail: 'ops@oshofree.test', adminPassword: 'a long first password' })
    const admin = await db.user.findUniqueOrThrow({ where: { email: 'ops@oshofree.test' } })

    // 1. Sign up, then New workspace.
    expect(await signUpAction(null, form({ name: 'Ama Owusu', email: 'ama@amafoods.test', password: 'a long password' }))).toBeNull()
    const ama = await db.user.findUniqueOrThrow({ where: { email: 'ama@amafoods.test' } })
    signInAs(ama)
    await expect(createWorkspaceAction(null, form({ name: 'Ama Foods', type: 'Brand', country: 'NG' }))).rejects.toMatchObject(REDIRECT)
    const ws = await db.workspace.findFirstOrThrow({ where: { name: 'Ama Foods' } })

    // 2. Invite a Manager.
    expect(await inviteAction('kojo@amafoods.test', 'Manager')).toMatchObject({ ok: true, email: 'kojo@amafoods.test' })

    // 3. Upload a creative and submit a campaign that runs it, from today.
    const creative = await uploadCreative(new File([PNG], 'card.png', { type: 'image/png' }))
    const submitted = await submitAction({
      name: 'Jollof week', brand: 'Ama Foods', country: 'NG', category: 'Food & drink', headline: 'Free drink with any jollof',
      description: 'Show the code at any Ama Foods outlet for a free drink.', tileColor: tokens.tileColors[0], placement: 'card',
      creativeImageKey: creative.key, redeemMethod: 'code', budgetUsd: 100, rewardLocal: 50, startsAt: todayIn('NG'),
      runsForDays: 14, termsAccepted: true,
    })
    if (!('id' in submitted)) throw new Error(submitted.error)

    // Global approves the workspace and the campaign (it goes live: its flight has started) and funds the rewards.
    signInAs(admin)
    expect(await approveWorkspaceAction(ws.id)).toMatchObject({ ok: true })
    expect(await approveCampaignAction(submitted.id)).toMatchObject({ ok: true })
    expect(await topUpAction(1000)).toMatchObject({ toast: expect.any(String) })

    // 4. A Phoenix user shares it (Phoenix's POST /share), and a friend opens their link and claims on the landing page.
    const shared = await phoenixShare(
      new Request('http://localhost/api/v1/share', {
        method: 'POST',
        headers: { authorization: `Bearer ${boot.generatedKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ offer_id: submitted.id, session_id: 'anon-1', via: 'whatsapp', msisdn: '+2348031234567' }),
      }),
    )
    expect(shared.status).toBe(201)
    const { code } = (await shared.json()) as { code: string }
    const friend = { cookie: 'og_v=0f1e2d3c-4b5a-4968-8776-655443322110', 'user-agent': 'Mozilla/5.0' }
    const params = { params: Promise.resolve({ code }) }
    expect((await openLanding(new Request(`http://localhost/o/${code}`, { headers: friend }), params)).status).toBe(200)
    expect((await claimOnLanding(new Request(`http://localhost/o/${code}/claim`, { method: 'POST', headers: friend }), params)).status).toBe(200)

    // 5. The claim earned the sharer a reward, and the daily job's payout run sends it.
    expect(await sendQueuedPayouts()).toEqual({ sent: 1, skipped: 0 })

    // ---- The restart: drop the client, then load each page's data function over a new one. ----
    const before = db
    await before.$disconnect()
    const global = globalThis as unknown as { db?: PrismaClient }
    delete global.db
    vi.resetModules()
    let fresh: PrismaClient | undefined
    try {
      fresh = (await import('@/lib/db')).db
      expect(fresh).not.toBe(before)
      const { listSwitcher } = await import('@/lib/active-workspace')
      const { advertiserDetail, advertiserRows } = await import('@/lib/advertisers')
      const { members, openInvites } = await import('@/lib/invitations')
      const { homeCards, rewardsLedgerRows } = await import('@/lib/reports')
      const { campaignActivity, workspaceSharers } = await import('@/lib/activity')
      const { reviewQueue } = await import('@/lib/review')
      const { GET: serveUpload } = await import('@/app/uploads/[key]/route')
      // Loaded again, so each reads through the new client, not the one the actions wrote with.
      expect(advertiserRows).not.toBe(advertiserRowsBefore)
      const now = new Date()

      // The switcher and Platform › Advertisers: the workspace, approved, with its live campaign; not demo data.
      expect(await listSwitcher(ama)).toMatchObject([{ id: ws.id, name: 'Ama Foods', status: 'approved', demo: false }])
      expect(await advertiserRows()).toMatchObject([{ id: ws.id, name: 'Ama Foods', owner: 'Ama Owusu', campaigns: 1, live: 1, demo: false }])
      // People: Ama as Owner, Kojo's invite open.
      expect(await members(ws.id)).toMatchObject([{ name: 'Ama Owusu', role: 'Owner' }])
      expect(await openInvites(ws.id)).toMatchObject([{ email: 'kojo@amafoods.test', role: 'Manager', invitedBy: 'Ama Owusu' }])
      // Campaigns home: the campaign is the live hero; Review shows it under Live now, nothing waiting.
      const home = await homeCards(ws.id, 'all', now)
      expect(home.hero?.id).toBe(submitted.id)
      expect(home.counts.live).toBe(1)
      const review = await reviewQueue(now)
      expect(review.rows).toEqual([])
      expect(review.livenow.map((c) => c.id)).toEqual([submitted.id])
      // The creative: the advertiser's page draws the uploaded file, and /uploads serves the same bytes from disk.
      const detail = await advertiserDetail(ws.id, now)
      expect(detail?.cards).toMatchObject([{ id: submitted.id, imageUrl: creative.url, createdBy: 'Ama Owusu' }])
      const served = await serveUpload(new Request(`http://localhost${creative.url}`), { params: Promise.resolve({ key: creative.key }) })
      expect(served.status).toBe(200)
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG)
      // The campaign page's Recent activity: the share, the friend's open and claim, and the reward, sent.
      const campaign = await fresh.campaign.findUniqueOrThrow({ where: { id: submitted.id } })
      const words = (await campaignActivity(campaign)).lines.map((l) => l.text.replace(/ · [^·]+$/, ''))
      expect(words).toEqual(
        expect.arrayContaining([
          '+234 80• ••• 4567 shared via WhatsApp',
          'A friend of +234 80• ••• 4567 opened the offer',
          'A friend of +234 80• ••• 4567 took claim code PHX-••••',
          '₦50 airtime for +234 80• ••• 4567 sent',
        ]),
      )
      // Sharing: the sharer with one friend's open and claim. Global's Rewards ledger: one successful share.
      expect((await workspaceSharers(ws.id)).rows).toMatchObject([{ campaignId: submitted.id, opened: 1, claimed: 1 }])
      expect(await rewardsLedgerRows()).toMatchObject([{ campaignId: submitted.id, workspaceName: 'Ama Foods', successfulShares: 1 }])
      expect(await fresh.rewardPayout.findMany({ select: { status: true, amountLocal: true } })).toEqual([{ status: 'sent', amountLocal: 50 }])
    } finally {
      // Whatever failed above, the new client's connection closes and the next test gets the old client back.
      await fresh?.$disconnect()
      global.db = before
    }
  })
})
