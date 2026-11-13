import { PageHead } from '@/components/console/PageHead'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'

export default function CampaignsPage() {
  return (
    <>
      <PageHead title={COPY.page.campaigns.title} subtitle={COPY.page.campaigns.subtitle} />
      <p className="text-sm" style={{ color: tokens.ink2 }}>
        Your campaigns will appear here.
      </p>
    </>
  )
}
