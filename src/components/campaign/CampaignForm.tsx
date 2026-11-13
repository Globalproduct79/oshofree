'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { saveDraft, submit } from '@/app/app/(console)/campaigns/actions'
import { campaignInput, type CampaignInput } from '@/lib/campaign-schema'
import { tokens } from '@/lib/tokens'
import { ConfirmSection } from './form/ConfirmSection'
import { ConsumerSection } from './form/ConsumerSection'
import { FormActions } from './form/FormActions'
import { MoneySection } from './form/MoneySection'
import { OfferSection } from './form/OfferSection'
import { PlacementSection } from './form/PlacementSection'
import { PreviewRail } from './form/PreviewRail'
import { RedeemSection } from './form/RedeemSection'
import { formProblem, type FormDefaults, type FormValues } from './form/values'

// cannotSubmit replaces "Submit for review" with the reason, e.g. when Global declined the workspace.
type Props = { campaignId?: string; defaults: FormDefaults; initialImageUrl?: string | null; cannotSubmit?: string | null }

export function CampaignForm({ campaignId, defaults, initialImageUrl = null, cannotSubmit = null }: Props) {
  const router = useRouter()
  const form = useForm<FormValues, unknown, CampaignInput>({ resolver: zodResolver(campaignInput), defaultValues: defaults, mode: 'onTouched' })
  const values = useWatch({ control: form.control })
  const [id, setId] = useState(campaignId)
  const [imageUrl, setImageUrl] = useState(initialImageUrl)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const errorRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const sub = form.watch(() => setSaved(false))
    return () => sub.unsubscribe()
  }, [form])
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

  // Saving first means a failed submit never loses the draft, and a second click never duplicates it.
  async function persist(data: CampaignInput) {
    const res = await saveDraft(data, id)
    if ('error' in res) {
      setError(res.error)
      return null
    }
    if (!id) {
      setId(res.id)
      window.history.replaceState(null, '', `/app/campaigns/${res.id}/edit`)
    }
    return res.id
  }

  const run = (then: (savedId: string) => Promise<void>) =>
    form.handleSubmit((data) =>
      startTransition(async () => {
        setError(null)
        const savedId = await persist(data)
        if (savedId) await then(savedId)
      }),
    )

  const onSave = run(async () => setSaved(true))
  const onSubmit = run(async (savedId) => {
    const res = await submit(savedId)
    if ('error' in res) return setError(res.error)
    router.push('/app')
  })

  return (
    <FormProvider {...form}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <form onSubmit={cannotSubmit ? (e) => e.preventDefault() : onSubmit} noValidate className="flex min-w-0 flex-col gap-6">
          {error && (
            <p
              ref={errorRef}
              role="alert"
              className="rounded-xl border px-4 py-3 text-sm"
              style={{ backgroundColor: tokens.redSoft, borderColor: tokens.redSoft, color: tokens.red }}
            >
              {error}
            </p>
          )}
          <OfferSection />
          <ConsumerSection imageUrl={imageUrl} onImage={setImageUrl} />
          <PlacementSection />
          <RedeemSection />
          <MoneySection />
          <ConfirmSection />
          <FormActions
            problem={formProblem(values)}
            pending={pending}
            saved={saved}
            onSave={onSave}
            cannotSubmit={cannotSubmit}
          />
        </form>
        <PreviewRail values={values} imageUrl={imageUrl} campaignId={id} />
      </div>
    </FormProvider>
  )
}
