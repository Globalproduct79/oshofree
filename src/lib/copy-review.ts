import { CAMPAIGN } from '@/lib/copy-campaign'

// Review (GLB §2.0, §2.1, §1.6), verbatim. The reject and decline dialogs replace the prototype's native
// prompt (D3); their labels and the refusal toasts are the controller's copy.

export const REVIEW = {
  crumb: 'Review',
  title: 'Review',
  lead: 'Nothing reaches a consumer until someone here approves it. Betting and draws must carry a licence number.',

  kpi: {
    live: 'Live on Phoenix',
    waiting: (n: number) => `${n} waiting for review`,
    impressions: 'Impressions',
    openRate: (pct: string) => `${pct} open rate`,
    charged: 'Charged for delivery',
    rewards: (usd: string) => `+ ${usd} rewards`,
    owed: 'Owed to Phoenix',
    kept: (usd: string) => `${usd} kept by Global`,
  },

  advertisers: {
    title: 'New advertisers',
    sub: 'Approve the workspace before any of its campaigns can go live.',
    // "**{name}** · {type} · {country}": the name is bold.
    rest: (type: string, country: string) => ` · ${type} · ${country}`,
    owner: (owner: string, credit: string) => `Owner ${owner} · default credit ${credit}`,
    noOwner: '—',
    approve: 'Approve',
    decline: 'Decline',
  },

  queue: {
    title: 'Campaigns waiting',
    sub: 'Real offer · lawful in market · terms clear · link works · betting and draws carry a licence or approval number and show 18+.',
    // "**{headline}** · {brand} via {workspace}": the headline is bold, the rest grey.
    revised: (headline: string) => `Revised offer · ${headline}`,
    via: (brand: string, workspace: string) => `${brand} via ${workspace}`,
    sep: ' · ',
    dates: (start: string, end: string) => `${start} – ${end}`,
    claimCode: 'claim code',
    reward: (amount: string) => `reward ${amount}`,
    link: { ok: 'Link works ✓', broken: 'Link failed ✗' },
    approve: 'Approve',
    reject: 'Reject',
    preview: 'Preview',
    empty: 'Nothing waiting.',
  },

  warn: {
    pending: 'Workspace not yet approved — approve it first.',
    declined: "Workspace declined — campaigns can't go live.",
    betting: (licence: boolean, age: boolean) =>
      `Betting or draw — ${licence ? 'licence number present ✓' : 'no licence number found ✗'} · 18+ ${age ? 'shown ✓' : 'missing ✗'}`,
  },

  live: { title: 'Live now' },

  toast: {
    approved: CAMPAIGN.approved,
    rejected: CAMPAIGN.rejected,
    workspaceApproved: (name: string) => `${name} approved — owner emailed`,
    workspaceDeclined: (name: string) => `${name} declined`,
  },

  errors: {
    workspaceFirst: 'Approve the workspace first.',
    flightEnded: 'The flight has already ended — the advertiser must pick new dates.',
    reasonRequired: 'Give a reason so the advertiser knows what to fix.',
    alreadyDecided: 'Someone already decided this. Reload to see where it stands.',
  },

  // The styled Reject dialog (spec §6.4): a reason code and a note, both sent to the advertiser.
  reject: {
    title: 'Reason sent to the advertiser',
    code: 'Reason',
    choose: 'Choose a reason',
    note: 'Note',
    noteDefault: 'Terms unclear — say where the offer can be redeemed.',
    confirm: 'Reject',
    cancel: 'Cancel',
  },

  // The Decline dialog: the reason is required and goes to the workspace's owner.
  decline: {
    title: (name: string) => `Decline ${name}`,
    reason: 'Reason sent to the owner',
    confirm: 'Decline',
    cancel: 'Cancel',
  },
} as const
