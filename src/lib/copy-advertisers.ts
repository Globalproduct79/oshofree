// Platform › Advertisers (GLB §2.2), verbatim; the detail page, "Close month" and the refusals are the
// controller's copy (spec §6.1, §6.5, §6.14.6) — the prototype had none of them.

const invoices = (n: number) => (n === 1 ? '1 invoice' : `${n} invoices`)

export const ADVERTISERS = {
  crumb: 'Advertisers',
  title: 'Advertisers',
  lead: 'Every workspace on the platform, with credit limits and approval.',
  head: ['Workspace', 'Type', 'Country', 'Status', 'Campaigns', 'Credit limit', 'In use', 'Outstanding', ''],
  // "{total} ({live} live)": the bracket is small and grey.
  live: (n: number) => `(${n} live)`,
  open: 'Open workspace',
  empty: 'No advertisers yet.',
  creditLabel: (name: string) => `Credit limit for ${name}`,
  creditToast: 'Credit limit updated — owner emailed',

  closeMonth: 'Close month',
  // The prototype printed "{n} invoices" for every n; one reads "1 invoice".
  closed: (n: number) => `Month closed — ${invoices(n)} issued`,
  notOver: "The month isn't over in every market yet.",
  noFx: 'Set an exchange rate for every market first.',

  errors: {
    limit: 'Enter a whole number of dollars, 0 or more.',
    tooLarge: 'That limit is too large.',
    noWorkspace: 'That workspace no longer exists.',
    noInvoice: 'That invoice no longer exists.',
    alreadyDecided: 'Someone already decided this. Reload to see where it stands.',
    reasonRequired: 'Give a reason so the advertiser knows what to fix.',
    type: 'Choose Brand or Agency.',
    country: 'Choose one of the five markets.',
    registration: 'Keep the registration number to 40 characters.',
    manager: 'Give the account manager a name of up to 60 characters.',
    field: "That can't be changed here.",
  },

  detail: {
    // "{Type} · {Country} · owner {name} · since {Mon YYYY}"
    lead: (type: string, country: string, owner: string, since: string) => `${type} · ${country} · owner ${owner} · since ${since}`,
    noOwner: '—',

    facts: 'Facts',
    status: 'Status',
    type: 'Type',
    country: 'Billing country',
    creditLimit: 'Credit limit',
    registration: 'Registration number',
    manager: 'Account manager',
    terms: 'Terms',
    termsValue: (days: number) => `Net ${days}`,
    since: 'Since',
    approve: 'Approve',
    decline: 'Decline',
    reapprove: 'Re-approve',
    approved: (name: string) => `${name} approved — owner emailed`,
    declined: (name: string) => `${name} declined`,
    factToast: {
      type: 'Type updated',
      country: 'Billing country updated — it applies from the next invoice',
      registrationNumber: 'Registration number updated',
      accountManager: 'Account manager updated',
    },
    // The Decline dialog: the reason is required and goes to the workspace's owner.
    declineDialog: {
      title: (name: string) => `Decline ${name}`,
      reason: 'Reason sent to the owner',
      confirm: 'Decline',
      cancel: 'Cancel',
    },

    campaigns: 'Campaigns',
    noCampaigns: 'No campaigns yet.',

    invoices: 'Invoices',
    invoicesHead: (currency: string) => ['Invoice', 'Period', 'Status', 'Due', 'USD', currency, ''],
    notDue: '—',
    markPaid: 'Mark paid',
    paid: (number: string) => `${number} marked paid — credit released`,
    noInvoices: 'Nothing outstanding.',

    requests: 'Credit requests',
    requestsHead: ['Requested by', 'Note', 'Sent', 'New limit', ''],
    noNote: '—',
    newLimitLabel: (who: string) => `New credit limit requested by ${who}`,
    approveRequest: 'Approve',
    dismiss: 'Dismiss',
    dismissed: 'Request dismissed',
    noRequests: 'No requests.',

    history: 'History',
    historyHead: ['Date', 'By', 'Action', 'Change'],
    system: 'System',
    noHistory: 'No history yet.',
  },
} as const

// What each audit action reads as in History; an action missing here prints its code.
export const AUDIT_ACTION: Record<string, string> = {
  'workspace.approve': 'Workspace approved',
  'workspace.decline': 'Workspace declined',
  'workspace.update': 'Settings changed',
  'workspace.enter': 'Global entered the workspace',
  'credit.limit': 'Credit limit changed',
  'credit.request': 'Credit requested',
  'credit.decide': 'Credit request decided',
  'invoice.issue': 'Invoice issued',
  'invoice.paid': 'Invoice marked paid',
  'campaign.approve': 'Campaign approved',
  'campaign.reject': 'Campaign rejected',
  'campaign.revision.approve': 'Revised offer approved',
  'campaign.revision.reject': 'Revised offer rejected',
  'campaign.submit': 'Campaign submitted',
  'campaign.edit': 'Campaign edited',
  'rewards.reward': 'Share reward changed',
  'rewards.caps': 'Reward caps changed',
  'member.invite': 'Member invited',
  'member.join': 'Member joined',
  'member.role': 'Member role changed',
  'member.remove': 'Member removed',
  'invite.revoke': 'Invitation revoked',
}
