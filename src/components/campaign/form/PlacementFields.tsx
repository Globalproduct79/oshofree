'use client'

import { PhoneThumb } from '@/components/campaign/PhoneFrame'
import { PreviewButton } from '@/components/campaign/PreviewButton'
import { Button, CreativePicker, OptionTile, type PickerStatus } from '@/components/og'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import type { PlacementKey } from '@/lib/copy-components'
import { MARKETS } from '@/lib/markets'
import type { PreviewCampaign, PreviewOffer } from '@/lib/preview-merge'
import { ACCEPT, PLACEMENT_ORDER, type FormValues } from './values'

type Props = {
  values: FormValues
  // Phoenix's current CPM per placement in the chosen country; null where Global has set none.
  cpmCents: Record<PlacementKey, number | null>
  choose: (placement: PlacementKey) => void
  // The creative picker's state, and its actions (Retry sends the picker's last file to `pick` again).
  status: PickerStatus
  pick: (file: File) => void
  remove: () => void
  // The draft as the preview draws it, and the live offers around it: a splash's View full size opens the preview on it.
  mine: PreviewCampaign
  loadLive: () => Promise<PreviewOffer[]>
}

const INVENTORY_TBC: readonly PlacementKey[] = ['video', 'splash']

// ADV §3 fields 8–9: the four placement tiles with their live CPM, then the creative picker the placement asks for:
// an image for a card or tile, an MP4 (played with controls) for video, either for a splash, shown in a small phone.
export function PlacementFields({ values: v, cpmCents, choose, status, pick, remove, mine, loadLive }: Props) {
  const drop = F.drop[v.placement]
  const splash = v.placement === 'splash' && v.creative !== null
  const country = MARKETS[v.country].name
  return (
    <>
      <div className="full">
        <label className="f" id="cf-placement">
          {F.fields.placement.label} <small>{F.fields.placement.hint}</small>
        </label>
        <div className="opts" role="group" aria-labelledby="cf-placement" style={{ marginTop: 6 }}>
          {PLACEMENT_ORDER.map((p) => {
            const cpm = cpmCents[p]
            return (
              <OptionTile
                key={p}
                pressed={v.placement === p}
                title={F.placements[p].name}
                desc={F.placements[p].description}
                big={cpm === null ? '—' : F.placements.cpm((cpm / 100).toFixed(2))}
                soon={INVENTORY_TBC.includes(p)}
                onClick={() => choose(p)}
              />
            )
          })}
        </div>
      </div>
      <div className="full">
        <CreativePicker
          label={drop.label}
          hint={drop.hint}
          zoneTitle={drop.zoneTitle}
          zoneHint={drop.zoneHint}
          accept={ACCEPT[v.placement]}
          chosen={v.creative && { url: v.creative.url, kind: v.creative.kind }}
          status={status}
          frame={splash ? <PhoneThumb mine={mine} country={country} label={F.drop.splashFrame} /> : undefined}
          actions={
            splash ? (
              <PreviewButton
                campaign={mine}
                load={loadLive}
                initialTab="splash"
                trigger={(show) => (
                  <Button variant="ghost" size="s" type="button" onClick={show}>
                    {F.drop.viewFull}
                  </Button>
                )}
              />
            ) : undefined
          }
          onPick={pick}
          onRemove={remove}
        />
      </div>
    </>
  )
}
