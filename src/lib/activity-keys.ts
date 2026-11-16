// What a browser may know of activity lines (lib/activity.ts reads them on the server): a line as drawn, the element
// id a link lands on, and what a line key in a URL may look like.

export type ActivityLine = { key: string; text: string; title: string }

// A line's element id, for a link to it (keys are ids and kinds; points keys carry a colon).
export const lineAnchor = (key: string) => `act-${key.replace(/[^\w-]/g, '-')}`

// A line key as a page may receive it in a URL: a kind and a row id.
export const isLineKey = (v: unknown): v is string => typeof v === 'string' && /^[\w:-]{1,160}$/.test(v)

// Where a reward's line is: its campaign's page, opened at that line (Global's held rewards link here).
export const rewardLineHref = (campaignId: string, payoutId: string) => `/app/campaigns/${campaignId}?line=reward-${payoutId}`
