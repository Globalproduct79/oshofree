import { Gift } from 'lucide-react'
import Image from 'next/image'
import { CreativeMedia } from '@/components/og'
import { lastDay } from '@/lib/campaign-status'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'

export type OfferCardProps = {
  brand: string
  headline: string
  description: string
  imageUrl?: string | null
  // An MP4 creative (a video or splash offer): the card shows its first frame.
  videoUrl?: string | null
  color?: string | null
  rewardLabel: string
  endsAt: Date
  outlined?: boolean
}

// UTC so the server and the browser print the same day.
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function initials(brand: string) {
  const letters = brand.split(/\s+/).filter(Boolean).map((w) => w[0]).join('')
  return letters.slice(0, 2).toUpperCase() || '?'
}

// Inside the card the creative is the picture the text describes: nothing more for a screen reader to say.
const SILENT = { image: '', video: '' }

// The card as the Phoenix Offers wall shows it: image, video frame or colour tile, brand, headline, reward, end date.
export function OfferCard({ offer }: { offer: OfferCardProps }) {
  return (
    <article
      data-outlined={offer.outlined ? 'true' : undefined}
      className="overflow-hidden border"
      style={{
        borderRadius: tokens.radius,
        borderColor: tokens.line,
        backgroundColor: tokens.card,
        outline: offer.outlined ? `2px solid ${tokens.accent}` : undefined,
        outlineOffset: offer.outlined ? 1 : undefined,
      }}
    >
      <div
        className="relative flex aspect-[16/9] items-center justify-center"
        style={{ backgroundColor: offer.color ?? tokens.tileColors[0] }}
      >
        {offer.videoUrl ? (
          <CreativeMedia image={null} video={offer.videoUrl} labels={SILENT} className="absolute inset-0 size-full object-cover" />
        ) : offer.imageUrl ? (
          <Image src={offer.imageUrl} alt="" fill unoptimized sizes="360px" className="object-cover" />
        ) : (
          <span className="text-3xl font-extrabold tracking-tight" style={{ color: tokens.card }}>
            {initials(offer.brand)}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <p className="truncate text-[11px]" style={{ color: tokens.ink3 }}>
          {offer.brand} · {COPY.card.sponsored}
        </p>
        <h3 className="text-sm font-semibold leading-snug" style={{ color: tokens.ink }}>
          {offer.headline}
        </h3>
        {offer.description && (
          <p className="line-clamp-2 text-xs leading-relaxed" style={{ color: tokens.ink2 }}>
            {offer.description}
          </p>
        )}
        <p className="mt-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: tokens.ink }}>
          <Gift className="size-3.5 shrink-0" style={{ color: tokens.accent }} aria-hidden />
          {offer.rewardLabel}
        </p>
        <p className="text-[11px]" style={{ color: tokens.ink3 }}>
          {COPY.card.ends(day.format(lastDay(offer.endsAt)))}
        </p>
      </div>
    </article>
  )
}
