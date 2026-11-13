export const COUNTRIES = ['NG', 'KE', 'GH', 'TZ', 'SN'] as const
export type Country = (typeof COUNTRIES)[number]

export type Market = {
  name: string
  currency: string
  symbol: string
  timezone: string
  dial: number
}

export const MARKETS: Record<Country, Market> = {
  NG: { name: 'Nigeria', currency: 'NGN', symbol: '₦', timezone: 'Africa/Lagos', dial: 234 },
  KE: { name: 'Kenya', currency: 'KES', symbol: 'KSh', timezone: 'Africa/Nairobi', dial: 254 },
  GH: { name: 'Ghana', currency: 'GHS', symbol: 'GH₵', timezone: 'Africa/Accra', dial: 233 },
  TZ: { name: 'Tanzania', currency: 'TZS', symbol: 'TSh', timezone: 'Africa/Dar_es_Salaam', dial: 255 },
  SN: { name: 'Senegal', currency: 'XOF', symbol: 'F', timezone: 'Africa/Dakar', dial: 221 },
}

export const CATEGORIES = [
  'Food & drink',
  'Personal care',
  'Banking & fintech',
  'Telecom & data',
  'Betting',
  'Travel',
  'Retail',
] as const
export type Category = (typeof CATEGORIES)[number]
