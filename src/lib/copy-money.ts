import { usd } from '@/lib/format'

// Money strings (ADV §7 Billing & credit, §8 Invoices, F3–F4), verbatim.

const fxNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export const MONEY = {
  // Statement lines.
  paidLine: (invoiceNumber: string) => `${invoiceNumber} paid`,
  deliveryLine: (campaign: string) => `${campaign} — delivery`,
  rewardsLine: (campaign: string) => `${campaign} — share rewards`,

  // Credit checks: the form hint (ADV §3 rule 9), Save changes (ADV §2), Resume (F3).
  overCredit: (limitCents: number, excessCents: number) =>
    `Over your credit limit of ${usd(limitCents)} by ${usd(excessCents)}. Pay an open invoice or ask Global to raise it.`,
  wouldExceed: (limitCents: number) => `That would exceed your credit limit of ${usd(limitCents)}`,
  cantResume: "Can't resume — credit limit reached. Pay the open invoice or ask Global to raise the limit.",

  // The Billing alert: bold red lead, then the detail.
  limitReached: 'Credit limit reached.',
  limitReachedDetail: 'Live campaigns pause until an invoice is paid or Global raises the limit.',

  markedPaid: (invoiceNumber: string) => `${invoiceNumber} marked paid (demo) — credit released`,
  requestSent: 'Request sent to Global — usually answered within a working day',

  billing: {
    title: 'Billing & credit',
    lead: "You are invoiced monthly in local currency. Your credit limit is what you can have running at once; campaigns pause when it's reached.",
    invoicesAction: 'Invoices',
    limitTitle: 'Credit limit',
    limitSub: 'set by Global',
    inUseTitle: 'In use',
    inUseSub: 'open invoices + running campaigns',
    availableTitle: 'Available',
    availableSub: 'for new campaigns',
    nearLimitSub: 'close to the limit',
    unbilledTitle: 'Unbilled this month',
    unbilledSub: (local: string) => `invoiced on the 1st · ${local}`,
    unbilledSubNoFx: 'invoiced on the 1st',
    statementTitle: 'Statement',
    statementSub: 'Every charge this month. Delivery and share rewards are separate lines.',
    statementHead: (currency: string) => ['Date', 'Description', 'USD', currency],
    monthNav: 'Statement month',
    // Ours (the prototype's was "No charges yet."): what the statement will hold, and when.
    noCharges: 'Nothing charged yet. Delivery and rewards appear here daily once a campaign is live.',
    howYouPayTitle: 'How you pay',
    // e.g. "… in NGN at a rate fixed for the month (1 USD = ₦1,550 in November). Pay by bank transfer within 14 days, …"
    howYouPay: (currency: string, symbol: string, fxPerUsd: number | null, month: string, termsDays: number) =>
      `We invoice on the 1st for the previous month's delivery and rewards, in ${currency} at a rate fixed for the month (1 USD = ${symbol}${fxPerUsd === null ? '—' : fxNumber.format(fxPerUsd)} in ${month}). Pay by bank transfer within ${termsDays} days, quoting the invoice number.`,
    currencyKey: 'Billing currency',
    termsKey: 'Terms',
    terms: (termsDays: number) => `Net ${termsDays}`,
    nextInvoiceKey: 'Next invoice',
    accountManagerKey: 'Account manager',
    // Ours (Prompt 10): before Global approves the workspace, nobody is its account manager yet.
    accountManagerNone: 'Named when Global approves you',
    accountManagerUnnamed: '—',
    moreTitle: 'Need more credit?',
    moreSub: 'Limits are raised after your first paid invoice, or on request for a committed plan.',
    moreAction: 'Request a higher limit',
  },

  invoices: {
    title: 'Invoices',
    lead: 'Monthly invoices in your currency. Pay by bank transfer and quote the invoice number.',
    head: (currency: string) => ['Invoice', 'Period', 'Status', 'Due', 'USD', currency, ''],
    toDate: (period: string) => `${period} (to date)`,
    notDue: '—',
    pdf: 'PDF',
    markPaid: 'Mark paid',
    empty: 'No invoices yet.',
    runningNumber: '—',
  },

  print: {
    title: (number: string) => `Invoice ${number}`,
    registration: (n: string) => `Registration ${n}`,
    period: (label: string) => `Period ${label}`,
    issued: (date: string) => `Issued ${date}`,
    due: (date: string) => `Due ${date}`,
    paid: (date: string) => `Paid ${date}`,
    head: (currency: string) => ['Date', 'Description', 'USD', currency],
    total: 'Total',
    rate: (symbol: string, fx: string) => `1 USD = ${symbol}${fx}`,
    pay: (number: string) => `Pay by bank transfer, quoting ${number}. Global shares the account details with your workspace owner.`,
    action: 'Print',
    noLines: 'No lines on this invoice.',
  },
} as const

// 'Oct 2026' for the month that starts at `period` in the market's time zone. en-US, because en-GB
// prints September as "Sept".
export const periodLabel = (period: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone }).format(period)
