import { checkCampaign, ruleContext, type CreditPosition, type FormEdit, type Refusal } from '@/lib/campaign-schema'
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

// The one hint the form shows and what keeps its primary button from going on: the first ADV §3 rule that fails (with
// the field it is about, which the form marks and moves the cursor to), then a missing rate (the placement), a missing
// exchange rate (the country), a declined workspace (nothing on the form). A new campaign is confirmed on its Review
// step, so its edit step asks for every rule but that one; Edit offer asks for the confirmation on its one page.
export function formProblem({ values, isNew, stage, edit, workspace, credit, cpmCents, fxPerUsd, now }: Args): Refusal | null {
  const v = isNew && stage === 'edit' ? { ...values, termsAccepted: true } : values
  const checked = checkCampaign(
    edit?.running ? revisionInput(v) : toInput(v),
    ruleContext(workspace.type, credit, values.country, edit, now),
  )
  const country = MARKETS[values.country].name
  if (!checked.ok) return { field: checked.field, message: checked.message }
  if (cpmCents === null) return { field: 'placement', message: F.errors.noRate(country) }
  if (fxPerUsd === null) return { field: 'country', message: F.errors.noFx(country) }
  if (workspace.declined) return { field: null, message: F.errors.workspaceDeclined }
  return null
}
