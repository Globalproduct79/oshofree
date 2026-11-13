import type { ReactNode } from 'react'
import { OfferCard } from '@/components/campaign/OfferCard'
import { COPY } from '@/lib/copy'
import type { PreviewCard } from '@/lib/preview-merge'
import { tokens } from '@/lib/tokens'

const P = COPY.preview
// The screen is laid out at a phone's width and drawn at three quarters, so cards keep their real proportions.
const SCALE = 0.75

// Phoenix's More → Offers screen inside a phone: header, category chips, the two-column card grid.
export function PhoneFrame({ cards, note, children }: { cards: PreviewCard[]; note: string | null; children?: ReactNode }) {
  const categories = [...new Set(cards.map((c) => c.category).filter((c): c is string => Boolean(c)))]
  return (
    <div
      className="relative mx-auto shrink-0 overflow-hidden"
      style={{ width: 260, height: 480, borderRadius: 32, border: `8px solid ${tokens.ink}`, backgroundColor: tokens.bg }}
    >
      <div
        aria-hidden
        className="absolute left-1/2 top-0 z-10 h-4 w-20 -translate-x-1/2 rounded-b-xl"
        style={{ backgroundColor: tokens.ink }}
      />
      <div className="h-full overflow-y-auto [scrollbar-width:none]">
        <div className="px-3 pb-5 pt-8" style={{ zoom: SCALE }}>
          <p className="text-[22px] font-bold" style={{ color: tokens.ink }}>
            {P.offers}
          </p>
          <ul className="mt-2 flex gap-1.5 overflow-hidden">
            {[P.all, ...categories].map((c, i) => (
              <li
                key={c}
                className="whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs"
                style={
                  i === 0
                    ? { backgroundColor: tokens.ink, borderColor: tokens.ink, color: tokens.card }
                    : { backgroundColor: tokens.card, borderColor: tokens.line, color: tokens.ink2 }
                }
              >
                {c}
              </li>
            ))}
          </ul>
          {note && (
            <p className="mt-3 text-xs" style={{ color: tokens.ink3 }}>
              {note}
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {children ?? cards.map((c) => <OfferCard key={c.key} offer={c} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
