import Image from 'next/image'
import { initials } from '@/components/campaign/OfferCard'
import { cn } from '@/lib/utils'
import { tokens } from '@/lib/tokens'

// The campaign's image, or its tile colour with the brand's initials, as the wall card shows it.
export function CampaignThumb({
  brand,
  imageUrl,
  color,
  className,
  textClass = 'text-3xl',
}: {
  brand: string
  imageUrl: string | null
  color: string | null
  className?: string
  textClass?: string
}) {
  return (
    <div
      className={cn('relative flex items-center justify-center overflow-hidden', className)}
      style={{ backgroundColor: color ?? tokens.tileColors[0] }}
    >
      {imageUrl ? (
        <Image src={imageUrl} alt="" fill unoptimized sizes="320px" className="object-cover" />
      ) : (
        <span className={cn('font-extrabold tracking-tight', textClass)} style={{ color: tokens.card }}>
          {initials(brand)}
        </span>
      )}
    </div>
  )
}
