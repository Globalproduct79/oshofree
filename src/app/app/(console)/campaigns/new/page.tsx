import { redirect } from 'next/navigation'
import { CampaignForm } from '@/components/campaign/CampaignForm'
import { newCampaignDefaults } from '@/components/campaign/form/values'
import { PageHead } from '@/components/shell/PageHead'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { creditSummary } from '@/lib/money'
import { can, requireMember } from '@/lib/permissions'
import { phoenixRates } from '@/lib/rates'

type Search = { brand?: string | string[]; focus?: string | string[] }
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

// ADV §3. A Viewer cannot create campaigns (spec §6.2), so the form is not theirs to fill.
export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { workspace: ws, role } = await requireMember('view')
  if (!can(role, 'campaigns')) redirect('/app')
  const sp = await searchParams
  const now = new Date()
  const [rates, credit] = await Promise.all([phoenixRates(now), creditSummary(ws.id)])
  // Workspace › Add client brand opens the form at the agency's Brand field, with any brand it names.
  const prefillBrand = ws.type === 'Agency' ? one(sp.brand) : undefined
  const defaults = newCampaignDefaults(ws, now)
  return (
    <>
      <PageHead
        crumb={[{ label: ws.name }, { label: F.head.new.crumb[0], href: '/app' }, { label: F.head.new.crumb[1] }]}
        title={F.head.new.title}
        lead={F.head.new.lead}
      />
      <CampaignForm
        workspace={{ id: ws.id, type: ws.type, declined: ws.status === 'declined' }}
        rates={rates}
        credit={{ limitCents: credit.limitCents, inUseCents: credit.inUseCents }}
        defaults={prefillBrand === undefined ? defaults : { ...defaults, brand: prefillBrand }}
        mode={{ kind: 'new', prefillBrand, focusBrand: one(sp.focus) === 'brand' }}
      />
    </>
  )
}
