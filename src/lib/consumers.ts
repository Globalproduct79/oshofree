import type { Consumer } from '@prisma/client'
import { db, type Tx } from '@/lib/db'
import { MARKETS, type Country } from '@/lib/markets'

// Canonical +<dial><9 or 10 digits>, or null when the number is not this country's.
export function normalisePhone(raw: string, country: Country): string | null {
  const dial = String(MARKETS[country].dial)
  const s = raw.replace(/[\s\-.()[\]]/g, '')
  let rest: string
  if (s.startsWith('+')) {
    if (!s.startsWith(`+${dial}`)) return null
    rest = s.slice(1 + dial.length)
  } else if (/^0\d{9,10}$/.test(s)) {
    rest = s.slice(1)
  } else if (s.startsWith(dial)) {
    rest = s.slice(dial.length)
  } else {
    return null
  }
  return /^\d{9,10}$/.test(rest) ? `+${dial}${rest}` : null
}

export function upsertConsumer(phone: string, country: Country, name?: string, client: Tx = db): Promise<Consumer> {
  const n = name?.trim()
  return client.consumer.upsert({
    where: { phone },
    create: { phone, country, name: n || null },
    update: n ? { name: n } : {},
  })
}
