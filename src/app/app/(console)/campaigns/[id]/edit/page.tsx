import type { Campaign } from '@prisma/client'
import { notFound, redirect } from 'next/navigation'
import { CampaignForm } from '@/components/campaign/CampaignForm'
import { campaignDefaults } from '@/components/campaign/form/values'
import { LinkButton } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { pendingRevision, RUNNING } from '@/lib/campaigns'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { SHELL } from '@/lib/copy-shell'
import { db } from '@/lib/db'
import { campaignSpendCents, COMMITTED, creditSummary } from '@/lib/money'
import { can, requireMember } from '@/lib/permissions'
import { phoenixRates } from '@/lib/rates'
import { creativeUrl } from '@/lib/storage'

// ADV §3 "Edit offer mode": the same form, prefilled with every field of the campaign (or with the
// revised offer still waiting for Global, so a second edit starts from it). A running campaign's money,
// timing, name and market are locked: its revision carries the offer only (spec §6.14.3).
export default async function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { workspace: ws, role } = await requireMember('view')
  if (!can(role, 'campaigns')) redirect(`/app/campaigns/${id}`)
  const campaign = await db.campaign.findFirst({ where: { id, workspaceId: ws.id } })
  if (!campaign) notFound()
  const running = RUNNING.includes(campaign.status)
  const now = new Date()
  const [rates, credit, spendCents, revision] = await Promise.all([
    phoenixRates(now),
    creditSummary(ws.id),
    campaignSpendCents(campaign.id),
    running ? pendingRevision(campaign.id) : null,
  ])
  const current: Campaign = revision ? { ...campaign, ...(revision.data as Partial<Campaign>) } : campaign
  // What the budget already holds in credit in use, so the rule and Credit after count only the increase.
  const heldCents = COMMITTED.includes(campaign.status) ? campaign.budgetUsd * 100 : spendCents
  return (
    <>
      <PageHead
        crumb={[{ label: ws.name }, { label: F.head.edit.crumb[0], href: '/app' }, { label: F.head.edit.crumb[1] }]}
        title={F.head.edit.title}
        lead={F.head.edit.lead}
        actions={
          <LinkButton variant="ghost" href="/app">
            {SHELL.nav.campaigns}
          </LinkButton>
        }
      />
      <CampaignForm
        workspace={{ id: ws.id, type: ws.type, declined: ws.status === 'declined' }}
        rates={rates}
        credit={{ limitCents: credit.limitCents, inUseCents: credit.inUseCents }}
        defaults={campaignDefaults(current, creativeUrl)}
        mode={{ kind: 'edit', id: campaign.id, running, heldCents }}
      />
    </>
  )
}
