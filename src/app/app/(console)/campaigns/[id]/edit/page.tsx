import { notFound, redirect } from 'next/navigation'
import { CampaignForm } from '@/components/campaign/CampaignForm'
import { campaignDefaults } from '@/components/campaign/form/values'
import { PageHead } from '@/components/console/PageHead'
import { COPY } from '@/lib/copy'
import { db } from '@/lib/db'
import { imageUrl } from '@/lib/storage'
import { tokens } from '@/lib/tokens'
import { requireWorkspace } from '@/lib/workspaces'

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ws = await requireWorkspace()
  const campaign = await db.campaign.findFirst({ where: { id, workspaceId: ws.id } })
  if (!campaign) notFound()
  if (campaign.status !== 'draft' && campaign.status !== 'rejected') redirect('/app')
  return (
    <>
      <PageHead title={COPY.page.editCampaign.title} subtitle={COPY.page.editCampaign.subtitle} />
      {campaign.status === 'rejected' && campaign.rejectReason && (
        <p
          role="status"
          className="mb-6 rounded-xl border px-4 py-3 text-sm"
          style={{ backgroundColor: tokens.amberSoft, borderColor: tokens.amberSoft, color: tokens.amber }}
        >
          {COPY.campaignForm.rejected(campaign.rejectReason)}
        </p>
      )}
      <CampaignForm
        campaignId={campaign.id}
        defaults={campaignDefaults(campaign)}
        initialImageUrl={campaign.creativeImageKey ? imageUrl(campaign.creativeImageKey) : null}
        cannotSubmit={ws.status === 'declined' ? COPY.campaignForm.workspaceDeclined : null}
      />
    </>
  )
}
