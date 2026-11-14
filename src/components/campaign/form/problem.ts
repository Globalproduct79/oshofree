import { checkCampaign, ruleContext, type CreditPosition, type FormEdit } from '@/lib/campaign-schema'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { MARKETS } from '@/lib/markets'
import { revisionInput, toInput, type FormValues } from './values'

// The New form edits on one page, then reviews everything before Submit (Prompt 6). Edit offer is one page.
export type FormStage = 'edit' | 'review'

type Args = {
  values: FormValues
  isNew: boolean
  stage: FormStage
  // Edit offer: whether the campaign runs (a revision) and what its budget holds in credit in use.
  edit?: FormEdit
  workspace: { type: 'Brand' | 'Agency'; declined: boolean }
  credit: CreditPosition
  // Phoenix's CPM for the chosen placement and the market's FX, null where Global has set none.
  cpmCents: number | null
  fxPerUsd: number | null
  now?: Date
}

// The one hint the form shows and what keeps its primary button disabled: the first ADV §3 rule that fails, then a
// missing rate, a missing exchange rate, a declined workspace. A new campaign is confirmed on its Review step, so its
// edit step asks for every rule but that one; Edit offer asks for the confirmation on its one page.
export function formProblem({ values, isNew, stage, edit, workspace, credit, cpmCents, fxPerUsd, now }: Args): string | null {
  const v = isNew && stage === 'edit' ? { ...values, termsAccepted: true } : values
  const checked = checkCampaign(
    edit?.running ? revisionInput(v) : toInput(v),
    ruleContext(workspace.type, credit, values.country, edit, now),
  )
  const country = MARKETS[values.country].name
  if (!checked.ok) return checked.message
  if (cpmCents === null) return F.errors.noRate(country)
  if (fxPerUsd === null) return F.errors.noFx(country)
  if (workspace.declined) return F.errors.workspaceDeclined
  return null
}
