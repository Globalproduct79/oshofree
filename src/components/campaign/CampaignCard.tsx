import type { Campaign } from '@prisma/client'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { CampaignThumb } from '@/components/campaign/CampaignThumb'
import { StatusPill } from '@/components/console/StatusPill'
import type { EffectiveStatus } from '@/lib/campaign-status'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'

const frame = { borderRadius: tokens.radius, borderColor: tokens.line }

// One of the other campaigns on Home: the tile, its name and brand, its status and one number.
export function CampaignCard({
  campaign: c,
  status,
  shares,
  imageUrl,
}: {
  campaign: Campaign
  status: EffectiveStatus
  shares: number
  imageUrl: string | null
}) {
  return (
    <Link
      href={`/app/campaigns/${c.id}`}
      className="flex flex-col overflow-hidden border transition-shadow hover:shadow-md"
      style={{ ...frame, backgroundColor: tokens.card }}
    >
      <CampaignThumb brand={c.brand} imageUrl={imageUrl} color={c.tileColor} className="h-28" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={{ color: tokens.ink }}>
            {c.name}
          </p>
          <p className="truncate text-xs" style={{ color: tokens.ink3 }}>
            {c.brand}
          </p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2">
          <StatusPill status={status} />
          <span className="text-xs font-medium" style={{ color: tokens.ink2 }}>
            {COPY.home.shares(shares)}
          </span>
        </div>
      </div>
    </Link>
  )
}

export function NewCampaignCard() {
  return (
    <Link
      href="/app/campaigns/new"
      className="flex min-h-[200px] flex-col items-center justify-center gap-2 border-2 border-dashed text-sm font-semibold"
      style={{ ...frame, color: tokens.ink2 }}
    >
      <Plus className="size-5" aria-hidden />
      {COPY.home.newCampaign}
    </Link>
  )
}
