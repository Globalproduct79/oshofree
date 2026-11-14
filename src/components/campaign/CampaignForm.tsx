'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { editOfferAction, previewOffers, submitAction } from '@/app/app/(console)/campaigns/actions'
import { PreviewButton } from '@/components/campaign/PreviewButton'
import { Box, Button, type PickerStatus } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { ageGated, todayIn, type CreditPosition, type FormEdit } from '@/lib/campaign-schema'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import type { PlacementKey } from '@/lib/copy-components'
import { clearDraft, loadDraft, saveDraft, startOver } from '@/lib/draft-store'
import type { PreviewOffer } from '@/lib/preview-merge'
import type { MarketRates } from '@/lib/rates'
import { CardPreview } from './form/CardPreview'
import { CostBox } from './form/CostBox'
import { OfferFields } from './form/OfferFields'
import { PlacementFields } from './form/PlacementFields'
import { formProblem, type FormStage } from './form/problem'
import { ReviewStep } from './form/ReviewStep'
import { TermsFields } from './form/TermsFields'
import { clearedNote, pickCreative } from './form/upload'
import { fits, offerInput, sameValues, toInput, type FormValues } from './form/values'

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
const HOME = '/app'

// The New campaign form and Edit offer (ADV §3): the first failing rule as the only hint, the primary disabled until
// there is none, and the card and the cost redrawn on every change. Edit offer is one page. A new campaign is edited
// on one page, then reviewed (Prompt 6): "Review before submitting" opens a read-only summary with the confirmation,
// "Submit for review" and "Back to edit". Its draft autosaves to this browser (spec §6.3); "Save draft", at either
// step, keeps it and goes to Campaigns home, where it waits as a card.
export function CampaignForm({ workspace, rates, credit, defaults, mode }: Props) {
  const router = useRouter()
  const [values, setValues] = useState(defaults)
  // The server's refusal, shown until the next change.
  const [notice, setNotice] = useState<string | null>(null)
  // The creative picker: resting, uploading (with its percentage) or refused (its Retry sends the file to pick again).
  const [creativeStatus, setCreativeStatus] = useState<PickerStatus>({ state: 'idle' })
  const uploading = creativeStatus.state === 'uploading'
  // Whether this browser holds a draft of the New form (Start over shows while it does).
  const [hasDraft, setHasDraft] = useState(false)
  const [pending, startTransition] = useTransition()
  // A new campaign's step: editing, or reviewing before Submit. Edit offer stays on 'edit'.
  const [stage, setStage] = useState<FormStage>('edit')
  // Moving between the steps hands focus to the Review heading, or back to the button that opened it.
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const primary = useRef<HTMLButtonElement>(null)
  const moved = useRef(false)
  const brandRef = useRef<HTMLInputElement>(null)
  const restored = useRef(false)
  const sent = useRef(false)
  // The values as they are now, for an upload that resolves after the placement has changed.
  const latest = useRef(values)
  useEffect(() => {
    latest.current = values
  }, [values])
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    if (stage === 'review') reviewHeading.current?.focus()
    else primary.current?.focus()
  }, [stage])

  const isNew = mode.kind === 'new'
  const edit: FormEdit | undefined = mode.kind === 'edit' ? { running: mode.running, heldCents: mode.heldCents } : undefined
  const locked = edit?.running ?? false
  const reviewing = isNew && stage === 'review'

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
  // A creative the new placement cannot take (a video on a card, a 3 MB splash image on a card) goes, and the
  // picker says why. An upload under way keeps its progress; pickCreative judges it against the new placement.
  const choose = (placement: PlacementKey) => {
    const gone = values.creative && !fits(placement, values.creative) ? values.creative : null
    setValues((v) => ({ ...v, placement, creative: fits(placement, v.creative) ? v.creative : null }))
    setCreativeStatus((s) => (s.state === 'uploading' ? s : { state: 'idle', note: gone ? clearedNote(gone, placement) : undefined }))
    setNotice(null)
  }
  // The placement may have changed while the file uploaded: a creative it cannot take is discarded.
  function pick(file: File) {
    setNotice(null)
    return pickCreative(file, {
      placement: () => latest.current.placement,
      status: setCreativeStatus,
      chosen: (creative) => setValues((v) => (fits(v.placement, creative) ? { ...v, creative } : v)),
      local: (f) => {
        const url = URL.createObjectURL(f)
        return { url, revoke: () => URL.revokeObjectURL(url) }
      },
    })
  }
  function removeCreative() {
    update({ creative: null })
    setCreativeStatus({ state: 'idle' })
  }
  function onStartOver() {
    setValues(startOver(workspace.id, defaults))
    setHasDraft(false)
    setNotice(null)
    if (!uploading) setCreativeStatus({ state: 'idle' })
  }
  // The confirmation is for what was reviewed: going back to change anything asks for it again.
  function onBack() {
    moved.current = true
    setStage('edit')
    update({ termsAccepted: false })
  }
  // Kept in this browser now (it autosaves anyway) and waiting on Campaigns home as a card.
  function onSaveDraft() {
    saveDraft(workspace.id, values)
    toast(F.toasts.draftSaved)
    router.push(HOME)
  }

  const cpmCents = rates.cpmCents[values.country]
  const fxPerUsd = rates.fxPerUsd[values.country]
  const problem = formProblem({
    values, isNew, stage, edit, workspace, credit, cpmCents: cpmCents[values.placement], fxPerUsd,
  })
  const hint = uploading ? F.upload.uploading : (notice ?? problem ?? '')
  const dirty = hasDraft || !sameValues(values, defaults)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (problem || pending || uploading) return
    if (isNew && stage === 'edit') {
      moved.current = true
      setNotice(null)
      setStage('review')
      return
    }
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

  const buttons = (
    <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <Button ref={primary} type="submit" variant="primary" disabled={problem !== null || pending || uploading} aria-describedby="cf-hint">
        {!isNew ? F.buttons.saveResubmit : reviewing ? F.buttons.submit : F.buttons.review}
      </Button>
      {reviewing && (
        <Button type="button" variant="ghost" disabled={pending} onClick={onBack}>
          {F.buttons.back}
        </Button>
      )}
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
      {isNew && (
        <Button type="button" variant="ghost" disabled={!dirty || pending || uploading} onClick={onSaveDraft}>
          {F.buttons.saveDraft}
        </Button>
      )}
      <span
        id="cf-hint"
        role={notice ? 'alert' : undefined}
        style={{ marginLeft: 'auto', color: 'var(--ink3)', fontSize: 13 }}
      >
        {hint}
      </span>
      {isNew && !reviewing && dirty && (
        <Button type="button" variant="ghost" onClick={onStartOver}>
          {F.buttons.startOver}
        </Button>
      )}
    </div>
  )

  return (
    <form className="two" onSubmit={onSubmit} noValidate>
      <div className="box">
        {reviewing ? (
          <ReviewStep
            values={values}
            cpmCents={cpmCents[values.placement]}
            fxPerUsd={fxPerUsd}
            credit={credit}
            mine={mine}
            update={update}
            headingRef={reviewHeading}
          >
            {buttons}
          </ReviewStep>
        ) : (
          <>
            {isNew && <p className="sub">{F.oneOffer}</p>}
            <div className="form">
              <OfferFields values={values} update={update} agency={workspace.type === 'Agency'} locked={locked} brandRef={brandRef} />
              <PlacementFields
                values={values}
                cpmCents={cpmCents}
                choose={choose}
                status={creativeStatus}
                pick={pick}
                remove={removeCreative}
                mine={mine}
                loadLive={() => previewOffers(values.country)}
              />
              <TermsFields values={values} update={update} locked={locked} minStart={isNew ? todayIn(values.country) : undefined} />
              {/* A new campaign is confirmed on its Review step. */}
              {!isNew && (
                <label className="chk full">
                  <input type="checkbox" checked={values.termsAccepted} onChange={(e) => update({ termsAccepted: e.target.checked })} />{' '}
                  {F.fields.terms}
                </label>
              )}
              {buttons}
            </div>
          </>
        )}
      </div>
      <div>
        <Box title={P.title} sub={P.subtitle}>
          <CardPreview values={values} />
        </Box>
        {/* On the Review step the estimate is part of the summary. */}
        {!reviewing && (
          <Box title={F.cost.title}>
            <CostBox
              values={values}
              cpmCents={cpmCents[values.placement]}
              fxPerUsd={fxPerUsd}
              credit={credit}
              heldCents={edit?.heldCents}
            />
          </Box>
        )}
      </div>
    </form>
  )
}
