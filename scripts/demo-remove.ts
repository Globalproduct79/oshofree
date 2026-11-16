import { pathToFileURL } from 'node:url'
import { db, type Tx } from '@/lib/db'

// `npm run demo:remove` (Prompt 9): deletes the seed's demo data — the workspaces and people marked `demo` — with
// everything that hangs off them, and nothing else. It always prints what it would delete first, and deletes only
// with DEMO_REMOVE=1. Phoenix's channels, rates, FX and share, the fraud rules, the aggregator's balance and top-ups,
// settlement statements and job runs belong to the platform, not to a workspace, and stay.
//
// A demo person whom a real record names stays, and the plan says why: a member of a real workspace, or the one who
// decided on, or acted in, a real workspace (Global's review and audit rows there). Their demo rows still go.

export type DemoRemoval = {
  database: string
  workspaces: string[]
  people: string[]
  kept: { email: string; why: string }[]
  // Rows per table, in the order they are deleted.
  rows: [string, number][]
}

type Scope = { workspaces: string[]; campaigns: string[]; users: string[]; consumers: string[] }

// Thrown inside the transaction to roll a dry run back: the plan is the deletion itself, undone.
class DryRun extends Error {}

async function keptBecause(userId: string, scope: Pick<Scope, 'workspaces' | 'campaigns'>): Promise<string | null> {
  const member = await db.workspaceMember.findFirst({ where: { userId, workspace: { demo: false } }, select: { workspace: { select: { name: true } } } })
  if (member) return `a member of ${member.workspace.name}`
  const review = await db.reviewAction.findFirst({
    where: {
      byUserId: userId,
      NOT: [{ targetType: 'Workspace', targetId: { in: scope.workspaces } }, { targetType: 'Campaign', targetId: { in: scope.campaigns } }],
    },
    select: { id: true },
  })
  if (review) return 'decided on a real workspace or campaign'
  const acted = await db.auditEvent.findFirst({
    where: { actorId: userId, workspaceId: { not: null, notIn: scope.workspaces } },
    select: { id: true },
  })
  return acted ? 'acted in a real workspace' : null
}

async function demoScope() {
  const [workspaces, people] = await Promise.all([
    db.workspace.findMany({ where: { demo: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.user.findMany({ where: { demo: true }, select: { id: true, email: true }, orderBy: { email: 'asc' } }),
  ])
  const wsIds = workspaces.map((w) => w.id)
  const campaigns = (await db.campaign.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((c) => c.id)
  const kept: DemoRemoval['kept'] = []
  const gone: typeof people = []
  for (const p of people) {
    const why = await keptBecause(p.id, { workspaces: wsIds, campaigns })
    if (why) kept.push({ email: p.email, why })
    else gone.push(p)
  }
  // A Phoenix user's number is the demo's when only demo campaigns' links carry it.
  const numbers = await db.shareLink.findMany({
    where: { campaignId: { in: campaigns }, consumerId: { not: null } }, select: { consumerId: true }, distinct: ['consumerId'],
  })
  const touched = numbers.map((n) => n.consumerId!)
  const elsewhere = await db.shareLink.findMany({
    where: { consumerId: { in: touched }, campaignId: { notIn: campaigns } }, select: { consumerId: true }, distinct: ['consumerId'],
  })
  const shared = new Set(elsewhere.map((n) => n.consumerId))
  const scope: Scope = { workspaces: wsIds, campaigns, users: gone.map((p) => p.id), consumers: touched.filter((c) => !shared.has(c)) }
  return { scope, workspaces: workspaces.map((w) => w.name), people: gone.map((p) => p.email), kept }
}

// Children before parents, so no foreign key refuses a row.
async function deleteIn(tx: Tx, s: Scope): Promise<[string, number][]> {
  const ws = { in: s.workspaces }
  const campaigns = { in: s.campaigns }
  const users = { in: s.users }
  const rows: [string, number][] = []
  const step = async (table: string, run: Promise<{ count: number }>) => void rows.push([table, (await run).count])

  await step('link events', tx.linkEvent.deleteMany({ where: { link: { campaignId: campaigns } } }))
  await step('reward payouts', tx.rewardPayout.deleteMany({ where: { OR: [{ workspaceId: ws }, { campaignId: campaigns }] } }))
  await step('ledger lines', tx.ledgerEntry.deleteMany({ where: { OR: [{ workspaceId: ws }, { campaignId: campaigns }] } }))
  await step('invoices', tx.invoice.deleteMany({ where: { workspaceId: ws } }))
  await step('claim codes', tx.claimCode.deleteMany({ where: { campaignId: campaigns } }))
  await step('points', tx.pointsLedger.deleteMany({ where: { campaignId: campaigns } }))
  await step('revisions', tx.campaignRevision.deleteMany({ where: { campaignId: campaigns } }))
  await step('channel events', tx.channelEvent.deleteMany({ where: { campaignId: campaigns } }))
  await step('share links', tx.shareLink.deleteMany({ where: { campaignId: campaigns } }))
  await step('Phoenix users (numbers)', tx.consumer.deleteMany({ where: { id: { in: s.consumers } } }))
  await step('campaigns', tx.campaign.deleteMany({ where: { id: campaigns } }))
  await step('review decisions', tx.reviewAction.deleteMany({
    where: { OR: [{ targetType: 'Workspace', targetId: ws }, { targetType: 'Campaign', targetId: campaigns }, { byUserId: users }] },
  }))
  await step('audit rows', tx.auditEvent.deleteMany({
    where: {
      OR: [
        { workspaceId: ws },
        { targetType: 'Workspace', targetId: ws },
        { targetType: 'Campaign', targetId: campaigns },
        { targetType: 'User', targetId: users, workspaceId: null },
        { actorId: users },
      ],
    },
  }))
  await step('notifications', tx.notification.deleteMany({ where: { OR: [{ workspaceId: ws }, { userId: users }] } }))
  await step('notification settings', tx.notificationPref.deleteMany({ where: { OR: [{ workspaceId: ws }, { userId: users }] } }))
  await step('credit requests', tx.creditRequest.deleteMany({ where: { workspaceId: ws } }))
  await step('invitations', tx.invitation.deleteMany({ where: { workspaceId: ws } }))
  await step('memberships', tx.workspaceMember.deleteMany({ where: { OR: [{ workspaceId: ws }, { userId: users }] } }))
  await step('workspaces', tx.workspace.deleteMany({ where: { id: ws } }))
  await step('people', tx.user.deleteMany({ where: { id: users } }))
  return rows
}

// What removing the demo data deletes. Without `commit` the deletion runs and is rolled back, so the plan is exactly
// what a real run would delete at that moment; with it, the rows are gone.
export async function removeDemo(opts: { commit: boolean }): Promise<DemoRemoval> {
  const [{ name: database }] = await db.$queryRaw<{ name: string }[]>`select current_database() as name`
  const { scope, workspaces, people, kept } = await demoScope()
  let rows: [string, number][] = []
  try {
    await db.$transaction(
      async (tx) => {
        rows = await deleteIn(tx, scope)
        if (!opts.commit) throw new DryRun()
      },
      { maxWait: 10_000, timeout: 300_000 },
    )
  } catch (e) {
    if (!(e instanceof DryRun)) throw e
  }
  return { database, workspaces, people, kept, rows }
}

function report(r: DemoRemoval, verb: string): string[] {
  const list = (xs: string[]) => (xs.length ? xs.join(', ') : 'none')
  const counted = r.rows.filter(([, n]) => n > 0).map(([table, n]) => `${n} ${table}`)
  return [
    `Demo data in ${r.database}:`,
    `  Workspaces (${r.workspaces.length}): ${list(r.workspaces)}`,
    `  People (${r.people.length}): ${list(r.people)}`,
    ...(r.kept.length ? [`  Kept, as real records name them: ${r.kept.map((k) => `${k.email} (${k.why})`).join(', ')}`] : []),
    `  Rows it ${verb}: ${list(counted)}`,
  ]
}

// The script: the plan, then the deletion only with DEMO_REMOVE=1. Answers the exit code.
export async function main(env: { DEMO_REMOVE?: string }, log: (line: string) => void): Promise<number> {
  const plan = await removeDemo({ commit: false })
  if (!plan.workspaces.length && !plan.people.length) {
    log(`No demo data in ${plan.database}.`)
    return 0
  }
  report(plan, 'would delete').forEach((line) => log(line))
  if (env.DEMO_REMOVE !== '1') {
    log('Refusing to delete: nothing was deleted. Run it again with DEMO_REMOVE=1 to delete the rows above.')
    return 1
  }
  report(await removeDemo({ commit: true }), 'deleted').forEach((line) => log(line))
  return 0
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main({ DEMO_REMOVE: process.env.DEMO_REMOVE }, (line) => console.log(line))
    .then((code) => {
      process.exitCode = code
    })
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e)
      process.exitCode = 1
    })
    .finally(() => db.$disconnect())
}
