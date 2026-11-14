'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { editOfferAction, previewOffers, submitAction } from '@/app/app/(console)/campaigns/actions'
import { PreviewButton } from '@/components/campaign/PreviewButton'
import { Box, Button } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { ageGated, checkCampaign, ruleContext, todayIn, type CreditPosition, type FormEdit } from '@/lib/campaign-schema'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import type { PlacementKey } from '@/lib/copy-components'
import { clearDraft, loadDraft, saveDraft, startOver } from '@/lib/draft-store'
import { MARKETS } from '@/lib/markets'
import type { PreviewOffer } from '@/lib/preview-merge'
import type { MarketRates } from '@/lib/rates'
import { CardPreview } from './form/CardPreview'
import { CostBox } from './form/CostBox'
import { OfferFields } from './form/OfferFields'
import { PlacementFields } from './form/PlacementFields'
import { TermsFields } from './form/TermsFields'
import { uploadCreative } from './form/upload'
import { fits, offerInput, revisionInput, sameValues, toInput, type FormValues } from './form/values'

export type FormMode =
  // ?brand= prefills an agency's client and focus=brand puts the cursor there (Workspace › Add client brand).
  | { kind: 'new'; prefillBrand?: string; focusBrand?: boolean }
  | ({ kind: 'edit'; id: string } & FormEdit)

type Props = {
  workspace: { id: string; type: 'Brand' | 'Agency'; declined: boolean }
  rates: MarketRates
  credit: CreditPosition
  defaults: FormValues
  mode: FormMode
}

const AUTOSAVE_MS = 400
const P = F.previewBox

// The New campaign form and Edit offer (ADV §3): one page, the first failing rule as the only hint,
// Submit disabled until there is none, and the card and the cost redrawn on every change. A new
// campaign's draft autosaves to this browser (spec §6.3).
export function CampaignForm({ workspace, rates, credit, defaults, mode }: Props) {
  const router = useRouter()
  const [values, setValues] = useState(defaults)
  // An upload's or the server's refusal, shown until the next change.
  const [notice, setNotice] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  // Whether this browser holds a draft of the New form (Start over shows while it does).
  const [hasDraft, setHasDraft] = useState(false)
  const [pending, startTransition] = useTransition()
  const brandRef = useRef<HTMLInputElement>(null)
  const restored = useRef(false)
  const sent = useRef(false)
  // The values as they are now, for an upload that resolves after the placement has changed.
  const latest = useRef(values)
  useEffect(() => {
    latest.current = values
  }, [values])

  const isNew = mode.kind === 'new'
  const edit: FormEdit | undefined = mode.kind === 'edit' ? { running: mode.running, heldCents: mode.heldCents } : undefined
  const locked = edit?.running ?? false

  // Once: this workspace's draft (a new campaign only), keeping a brand's own name and the client
  // Add client brand asked for.
  useEffect(() => {
    if (restored.current || mode.kind !== 'new') return
    restored.current = true
    const draft = loadDraft(workspace.id, defaults)
    if (draft) {
      setValues({ ...draft, brand: workspace.type === 'Brand' ? defaults.brand : (mode.prefillBrand ?? draft.brand) })
      setHasDraft(true)
    }
    if (mode.focusBrand) brandRef.current?.focus()
  }, [mode, workspace.id, workspace.type, defaults])

  useEffect(() => {
    if (!isNew || !restored.current) return
    const t = setTimeout(() => {
      if (sent.current) return
      const pristine = sameValues(values, defaults)
      if (pristine) clearDraft(workspace.id)
      else saveDraft(workspace.id, values)
      setHasDraft(!pristine)
    }, AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [isNew, values, defaults, workspace.id])

  const update = (patch: Partial<FormValues>) => {
    setValues((v) => ({ ...v, ...patch }))
    setNotice(null)
  }
  // A creative the new placement cannot take (a video on a card) goes.
  const choose = (placement: PlacementKey) => {
    setValues((v) => ({ ...v, placement, creative: fits(placement, v.creative) ? v.creative : null }))
    setNotice(null)
  }
  // The placement may have changed while the file uploaded: a creative it cannot take is discarded.
  async function pick(file: File) {
    setNotice(null)
    setUploading(true)
    const res = await uploadCreative(file)
    setUploading(false)
    if (!res.ok) return setNotice(res.message)
    if (!fits(latest.current.placement, res.creative)) return setNotice(F.validation.creativeMismatch)
    setValues((v) => (fits(v.placement, res.creative) ? { ...v, creative: res.creative } : v))
  }
  function onStartOver() {
    setValues(startOver(workspace.id, defaults))
    setHasDraft(false)
    setNotice(null)
  }

  const cpmCents = rates.cpmCents[values.country]
  const fxPerUsd = rates.fxPerUsd[values.country]
  const country = MARKETS[values.country].name
  const checked = checkCampaign(
    locked ? revisionInput(values) : toInput(values),
    ruleContext(workspace.type, credit, values.country, edit),
  )
  const problem = !checked.ok
    ? checked.message
    : cpmCents[values.placement] === null
      ? F.errors.noRate(country)
      : fxPerUsd === null
        ? F.errors.noFx(country)
        : workspace.declined
          ? F.errors.workspaceDeclined
          : null
  const hint = uploading ? F.upload.uploading : (notice ?? problem ?? '')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (problem || pending || uploading) return
    startTransition(async () => {
      if (mode.kind === 'new') {
        const res = await submitAction(toInput(values))
        if ('error' in res) return setNotice(res.error)
        sent.current = true
        clearDraft(workspace.id)
        toast(F.toasts.submitted)
        router.push(`/app/campaigns/${res.id}`)
        return
      }
      const res = await editOfferAction(mode.id, locked ? offerInput(values) : toInput(values))
      if ('error' in res) return setNotice(res.error)
      toast(F.toasts.resubmitted)
      router.push(`/app/campaigns/${mode.id}`)
    })
  }

  // The draft as the Phoenix preview draws it: a new one has no id yet, so it cannot match a live offer.
  const mine: PreviewOffer = {
    id: mode.kind === 'edit' ? mode.id : '__draft',
    brand: values.brand.trim() || P.brand,
    headline: values.headline.trim(),
    category: values.category,
    placement: values.placement,
    ageGated: ageGated(values),
    creative: {
      image: values.creative?.kind === 'image' ? values.creative.url : null,
      video: values.creative?.kind === 'video' ? values.creative.url : null,
      color: values.tileColor,
    },
  }

  return (
    <form className="two" onSubmit={onSubmit} noValidate>
      <div className="box">
        <div className="form">
          <OfferFields values={values} update={update} agency={workspace.type === 'Agency'} locked={locked} brandRef={brandRef} />
          <PlacementFields
            values={values}
            cpmCents={cpmCents}
            choose={choose}
            pick={pick}
            remove={() => update({ creative: null })}
          />
          <TermsFields values={values} update={update} locked={locked} minStart={isNew ? todayIn(values.country) : undefined} />
          <label className="chk full">
            <input type="checkbox" checked={values.termsAccepted} onChange={(e) => update({ termsAccepted: e.target.checked })} />{' '}
            {F.fields.terms}
          </label>
          <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button type="submit" variant="primary" disabled={problem !== null || pending || uploading} aria-describedby="cf-hint">
              {isNew ? F.buttons.submit : F.buttons.saveResubmit}
            </Button>
            <PreviewButton
              mine={mine}
              country={values.country}
              load={() => previewOffers(values.country)}
              trigger={(show) => (
                <Button type="button" variant="ghost" onClick={show}>
                  {F.buttons.preview}
                </Button>
              )}
            />
            {mode.kind === 'edit' && (
              <Button type="button" variant="ghost" onClick={() => router.push(`/app/campaigns/${mode.id}`)}>
                {F.buttons.cancel}
              </Button>
            )}
            <span
              id="cf-hint"
              role={notice ? 'alert' : undefined}
              style={{ marginLeft: 'auto', color: 'var(--ink3)', fontSize: 13 }}
            >
              {hint}
            </span>
            {isNew && (hasDraft || !sameValues(values, defaults)) && (
              <Button type="button" variant="ghost" onClick={onStartOver}>
                {F.buttons.startOver}
              </Button>
            )}
          </div>
        </div>
      </div>
      <div>
        <Box title={P.title} sub={P.subtitle}>
          <CardPreview values={values} />
        </Box>
        <Box title={F.cost.title}>
          <CostBox
            values={values}
            cpmCents={cpmCents[values.placement]}
            fxPerUsd={fxPerUsd}
            credit={credit}
            heldCents={edit?.heldCents}
          />
        </Box>
      </div>
    </form>
  )
}
