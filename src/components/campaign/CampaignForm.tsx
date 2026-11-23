'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, type FocusEvent, type FormEvent } from 'react'
import { editOfferAction, previewOffers, submitAction } from '@/app/app/(console)/campaigns/actions'
import { PreviewButton } from '@/components/campaign/PreviewButton'
import { Box, Button, type PickerStatus } from '@/components/og'
import { toast } from '@/components/shell/toast-store'
import { todayIn, type CampaignField, type CreditPosition, type FormEdit, type Refusal } from '@/lib/campaign-schema'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import type { PlacementKey } from '@/lib/copy-components'
import { clearDraft, loadDraft, saveDraft, startOver } from '@/lib/draft-store'
import type { MarketRates } from '@/lib/rates'
import { CardPreview } from './form/CardPreview'
import { CostBox } from './form/CostBox'
import { fieldOf, fieldProps, focusField, HINT_ID, type Marked } from './form/field'
import { backToEdit, left, markedOf, NO_MARKS, pressedOn, pressOutcome, toReview, type Marks } from './form/marks'
import { OfferFields } from './form/OfferFields'
import { formPreview } from './form/preview'
import { PlacementFields } from './form/PlacementFields'
import { afterRefusal, formProblem, type FormStage } from './form/problem'
import { ReviewStep } from './form/ReviewStep'
import { TermsFields } from './form/TermsFields'
import { pickCreative, SessionUploads, switchPlacement } from './form/upload'
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
  // The preview's share sheet holds this sample link (a sharer's link in shape, opening nothing).
  sampleLink: string
}

const AUTOSAVE_MS = 400
const P = F.previewBox
const HOME = '/app'

// The New campaign form and Edit offer (ADV §3): the first failing rule as the only hint, the primary disabled until
// there is none, and the card and the cost redrawn on every change. Edit offer is one page. A new campaign is edited
// on one page, then reviewed (Prompt 6): "Review before submitting" opens a read-only summary with the confirmation,
// "Submit for review" and "Back to edit". Its draft autosaves to this browser (spec §6.3); "Save draft", at either
// step, keeps it and goes to Campaigns home, where it waits as a card.
export function CampaignForm({ workspace, rates, credit, defaults, mode, sampleLink }: Props) {
  const router = useRouter()
  const [values, setValues] = useState(defaults)
  // The server's refusal, shown until the next change, and marked on its field when it names one.
  const [notice, setNotice] = useState<Refusal | null>(null)
  // The field a refusal on Edit offer (one page) puts the cursor in, once the form has drawn it.
  const focusAfter = useRef<CampaignField | null>(null)
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
  // The field an Edit on the Review step goes back to.
  const editing = useRef<CampaignField | null>(null)
  // Which refused field is marked: one the person has left, or the one refused when they pressed (form/marks.ts).
  const [marks, setMarks] = useState<Marks>(NO_MARKS)
  const restored = useRef(false)
  // The files uploaded here: deleted once the form lets go of them and its draft no longer names them, so a Replace leaves no file behind.
  const [uploads] = useState(() => new SessionUploads())
  const sent = useRef(false)
  // The values as they are now, for an upload that resolves after the placement has changed.
  const latest = useRef(values)
  useEffect(() => {
    latest.current = values
  }, [values])
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    const field = editing.current
    editing.current = null
    if (stage === 'review') reviewHeading.current?.focus()
    else if (!field || !focusField(field)) primary.current?.focus()
  }, [stage])

  useEffect(() => {
    const field = focusAfter.current
    focusAfter.current = null
    if (field) focusField(field)
  }, [notice])

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
      // The draft no longer names a file the form let go of: it can be deleted now.
      uploads.flush()
    }, AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [isNew, values, defaults, workspace.id, uploads])
  // Edit offer keeps no draft: a file it let go of is deleted at once.
  useEffect(() => {
    if (!isNew) uploads.flush()
  }, [isNew, values, uploads])

  const update = (patch: Partial<FormValues>) => {
    setValues((v) => ({ ...v, ...patch }))
    setNotice(null)
  }
  // Why a placement switch took the creative off while a file uploaded: said with that upload's failure.
  const droppedNote = useRef<string | null>(null)
  // A creative the new placement cannot take (a video on a card, a 3 MB splash image on a card) goes, and the
  // picker says why: at once, or, while a file uploads (its progress stays), if that upload fails. Pressing the
  // placement already chosen changes nothing.
  const choose = (placement: PlacementKey) => {
    const next = switchPlacement(values, placement)
    if (!next) return
    uploads.letGo(values.creative, next.values.creative)
    setValues(next.values)
    if (uploading) droppedNote.current = next.gone ?? droppedNote.current
    else setCreativeStatus({ state: 'idle', note: next.gone ?? undefined })
    setNotice(null)
  }
  // The placement may have changed while the file uploaded: a creative it cannot take is discarded.
  function pick(file: File) {
    setNotice(null)
    droppedNote.current = null
    return pickCreative(file, {
      placement: () => latest.current.placement,
      status: setCreativeStatus,
      chosen: (creative) => {
        uploads.add(creative)
        // The creative it replaces (pickCreative has checked that the placement takes this one).
        uploads.letGo(latest.current.creative, creative)
        setValues((v) => (fits(v.placement, creative) ? { ...v, creative } : v))
      },
      unused: (creative) => uploads.drop(creative),
      local: (f) => {
        const url = URL.createObjectURL(f)
        return { url, revoke: () => URL.revokeObjectURL(url) }
      },
      dropped: () => droppedNote.current,
    })
  }
  function removeCreative() {
    uploads.letGo(values.creative)
    update({ creative: null })
    setCreativeStatus({ state: 'idle' })
  }
  function onStartOver() {
    uploads.letGo(values.creative)
    setValues(startOver(workspace.id, defaults))
    uploads.flush()
    setHasDraft(false)
    setNotice(null)
    setMarks(NO_MARKS)
    setCreativeStatus({ state: 'idle' })
  }
  // The confirmation is for what was reviewed: going back to change anything asks for it again. `field` gets the
  // cursor (an Edit's field, or the one a press on Review was refused for, which is `refused` and marked).
  function onBack(field?: CampaignField, refused = false) {
    moved.current = true
    editing.current = field ?? null
    setMarks((m) => backToEdit(m, refused ? (field ?? null) : null))
    setStage('edit')
    update({ termsAccepted: false })
  }
  // Kept in this browser now (it autosaves anyway) and waiting on Campaigns home as a card.
  function onSaveDraft() {
    saveDraft(workspace.id, values)
    uploads.flush()
    toast(F.toasts.draftSaved)
    router.push(HOME)
  }

  const cpmCents = rates.cpmCents[values.country]
  const fxPerUsd = rates.fxPerUsd[values.country]
  const problem = formProblem({
    values, isNew, stage, edit, workspace, credit, cpmCents: cpmCents[values.placement], fxPerUsd,
  })
  const hint = uploading ? F.upload.uploading : (notice?.message ?? problem?.message ?? '')
  const marked: Marked = markedOf(problem, marks) ?? (notice?.field ? notice : null)
  function onBlur(e: FocusEvent) {
    const field = fieldOf(e.target)
    if (field) setMarks((m) => left(m, field))
  }
  const dirty = hasDraft || !sameValues(values, defaults)

  // The server refused what the form's own rules let through: its sentence by the buttons and on its field, with the
  // cursor there (on the Review step, back on the edit step first); a creative whose file is gone comes off.
  function refused(res: { error: string; field?: CampaignField; creativeGone?: true }) {
    const next = afterRefusal(latest.current, res)
    if (next.values !== latest.current) {
      setValues(next.values)
      setCreativeStatus({ state: 'idle' })
    }
    if (reviewing && res.field) onBack(res.field)
    else focusAfter.current = res.field ?? null
    setNotice(next.notice)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (pending || uploading) return
    // The primary says why it does nothing beside it, and the cursor goes to the field that needs the fix.
    if (problem) {
      setMarks((m) => pressedOn(m, problem))
      const focused = problem.field !== null && focusField(problem.field)
      if (pressOutcome(problem.field, focused, reviewing) === 'back') onBack(problem.field ?? undefined, true)
      return
    }
    if (isNew && stage === 'edit') {
      moved.current = true
      setNotice(null)
      setMarks(toReview)
      setStage('review')
      return
    }
    startTransition(async () => {
      if (mode.kind === 'new') {
        const res = await submitAction(toInput(values))
        if ('error' in res) return refused(res)
        sent.current = true
        clearDraft(workspace.id)
        toast(F.toasts.submitted)
        router.push(`/app/campaigns/${res.id}`)
        return
      }
      const res = await editOfferAction(mode.id, locked ? offerInput(values) : toInput(values))
      if ('error' in res) return refused(res)
      toast(F.toasts.resubmitted)
      router.push(`/app/campaigns/${mode.id}`)
    })
  }

  // The campaign as the preview draws it, from the values as they stand.
  const mine = formPreview(values, mode.kind === 'edit' ? mode.id : '__draft', sampleLink)

  const buttons = (
    <div className="full" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      {/* Not disabled while a rule fails: pressing it moves the cursor to the field to fix (aria-disabled says it
          cannot submit, and the hint it points at says why). */}
      <Button
        ref={primary}
        type="submit"
        aria-busy={pending || undefined}
        variant="primary"
        disabled={pending || uploading}
        aria-disabled={problem !== null || undefined}
        aria-describedby={HINT_ID}
      >
        {!isNew ? F.buttons.saveResubmit : reviewing ? F.buttons.submit : F.buttons.review}
      </Button>
      {reviewing && (
        <Button type="button" variant="ghost" disabled={pending} onClick={() => onBack()}>
          {F.buttons.back}
        </Button>
      )}
      <PreviewButton
        campaign={mine}
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
      {/* The draft autosaves while the form differs from its defaults, and only to this browser (Prompt 9). */}
      {isNew && dirty && <span className="saved-here">{F.savedHere}</span>}
      <span
        id={HINT_ID}
        role={notice ? 'alert' : undefined}
        style={{ marginLeft: 'auto', color: 'var(--ink3)', fontSize: 13 }}
      >
        {hint}
      </span>
      {/* Not while a file uploads: it would land in the emptied form (Save draft waits for it too). */}
      {isNew && !reviewing && dirty && (
        <Button type="button" variant="ghost" disabled={uploading} onClick={onStartOver}>
          {F.buttons.startOver}
        </Button>
      )}
    </div>
  )

  return (
    <form className="two" onSubmit={onSubmit} onBlur={onBlur} noValidate>
      <div className="box">
        {reviewing ? (
          <ReviewStep
            values={values}
            cpmCents={cpmCents[values.placement]}
            fxPerUsd={fxPerUsd}
            credit={credit}
            mine={mine}
            update={update}
            onEdit={(field) => onBack(field)}
            agency={workspace.type === 'Agency'}
            marked={marked}
            headingRef={reviewHeading}
          >
            {buttons}
          </ReviewStep>
        ) : (
          <>
            {isNew && <p className="sub">{F.oneOffer}</p>}
            <div className="form">
              <OfferFields
                values={values}
                update={update}
                agency={workspace.type === 'Agency'}
                locked={locked}
                brandRef={brandRef}
                marked={marked}
              />
              <PlacementFields
                values={values}
                cpmCents={cpmCents}
                choose={choose}
                status={creativeStatus}
                pick={pick}
                remove={removeCreative}
                mine={mine}
                loadLive={() => previewOffers(values.country)}
                marked={marked}
              />
              <TermsFields
                values={values}
                update={update}
                locked={locked}
                minStart={isNew ? todayIn(values.country) : undefined}
                marked={marked}
              />
              {/* A new campaign is confirmed on its Review step. */}
              {!isNew && (
                <label className="chk full">
                  <input
                    {...fieldProps('termsAccepted', marked, HINT_ID)}
                    type="checkbox"
                    checked={values.termsAccepted}
                    onChange={(e) => update({ termsAccepted: e.target.checked })}
                  />{' '}
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
