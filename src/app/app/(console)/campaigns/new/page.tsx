import { CampaignForm } from '@/components/campaign/CampaignForm'
import { newCampaignDefaults } from '@/components/campaign/form/values'
import { PageHead } from '@/components/console/PageHead'
import { COPY } from '@/lib/copy'
import { requireWorkspace } from '@/lib/workspaces'

export default async function NewCampaignPage() {
  const ws = await requireWorkspace()
  return (
    <>
      <PageHead title={COPY.page.newCampaign.title} subtitle={COPY.page.newCampaign.subtitle} />
      <CampaignForm
        defaults={newCampaignDefaults(ws)}
        cannotSubmit={ws.status === 'declined' ? COPY.campaignForm.workspaceDeclined : null}
      />
    </>
  )
}
