'use client'

import { DropZone, OptionTile } from '@/components/og'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import type { PlacementKey } from '@/lib/copy-components'
import { ACCEPT, PLACEMENT_ORDER, type FormValues } from './values'

type Props = {
  values: FormValues
  // Phoenix's current CPM per placement in the chosen country; null where Global has set none.
  cpmCents: Record<PlacementKey, number | null>
  choose: (placement: PlacementKey) => void
  pick: (file: File) => void
  remove: () => void
}

const INVENTORY_TBC: readonly PlacementKey[] = ['video', 'splash']

// ADV §3 fields 8–9: the four placement tiles with their live CPM, then the drop zone the placement asks for.
export function PlacementFields({ values: v, cpmCents, choose, pick, remove }: Props) {
  const drop = F.drop[v.placement]
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
        <DropZone
          label={drop.label}
          hint={drop.hint}
          zoneTitle={drop.zoneTitle}
          zoneHint={drop.zoneHint}
          preview={v.creative?.url}
          previewKind={v.creative?.kind}
          accept={ACCEPT[v.placement]}
          onPick={pick}
          onRemove={remove}
        />
      </div>
    </>
  )
}
