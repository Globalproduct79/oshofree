import { SharingTable } from '@/components/campaign/SharingTable'
import { NumberTile } from '@/components/console/NumberTile'
import { COPY } from '@/lib/copy'
import { num } from '@/lib/format'
import type { Sharing } from '@/lib/reports'

const C = COPY.campaign
const S = C.sharing

// Shares and the friends they reached: five counts, the viral coefficient, and two breakdowns.
export function SharingSection({ sharing: s }: { sharing: Sharing }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumberTile label={S.shares} value={num(s.shares)} />
        <NumberTile label={S.friendOpens} value={num(s.friendOpens)} />
        <NumberTile label={S.friendClaims} value={num(s.friendClaims)} />
        <NumberTile label={S.detailsLeft} value={num(s.detailsLeft)} />
        <NumberTile label={S.deepestChain} value={num(s.deepestChain)} />
        <NumberTile
          label={S.viral}
          value={s.viralCoefficient === null ? S.none : s.viralCoefficient.toFixed(2)}
          hint={S.viralHint}
        />
      </div>
      <div className="flex flex-col gap-4">
        <SharingTable
          title={S.byChannel}
          first={S.channel}
          rows={s.byChannel.map((r) => ({ ...r, key: r.channel, name: C.channel(r.channel) }))}
        />
        <SharingTable
          title={S.byMedium}
          first={S.medium}
          rows={s.byMedium.map((r) => ({ ...r, key: r.via, name: C.via[r.via] }))}
        />
      </div>
    </div>
  )
}
