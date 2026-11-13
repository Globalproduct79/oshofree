// Numbers and dates the console prints. UTC dates so the server and the browser print the same day.

const numbers = new Intl.NumberFormat('en-GB')
const days = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export const num = (n: number) => numbers.format(n)

// 'YYYY-MM-DD' → '13 Nov'
export const dayLabel = (ymd: string) => days.format(new Date(`${ymd}T00:00:00Z`))

export const shortDate = (d: Date) => days.format(d)
