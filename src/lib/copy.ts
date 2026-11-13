export const COPY = {
  auth: {
    signInTitle: 'Sign in to OshoFree',
    signUpTitle: 'Create your OshoFree account',
    badCredentials: "That email and password don't match.",
    emailTaken: 'An account with that email already exists. Sign in instead.',
    invalidSignUp: 'Enter your name, a valid work email and a password of at least 8 characters.',
    nameLabel: 'Name',
    emailLabel: 'Work email',
    passwordLabel: 'Password',
    signInAction: 'Sign in',
    signUpAction: 'Create account',
    toSignUp: 'New to OshoFree? Create an account',
    toSignIn: 'Already have an account? Sign in',
  },
  workspace: {
    newTitle: 'Create your workspace',
    newSubtitle: 'Global checks every new advertiser before campaigns can go live, usually within a working day.',
    title: 'Workspace',
    subtitle: 'The name, type and billing country Global sees. Invoices will use the billing country.',
    nameLabel: 'Workspace name',
    typeLabel: 'Type',
    countryLabel: 'Billing country',
    createAction: 'Create workspace',
    saveAction: 'Save changes',
    saved: 'Saved.',
    invalid: 'Enter a name of 2 to 80 characters, a type and a billing country.',
    ownerOnly: 'Only the workspace Owner can change these details.',
    types: { Brand: 'Brand', Agency: 'Agency' },
  },
  banner: {
    pending:
      "Your workspace is waiting for Global's approval. You can draft campaigns now; they go live once both are approved.",
    impersonating: (name: string) => `You are viewing ${name} as Global.`,
    exit: 'Exit',
  },
  setup: {
    title: 'Set up OshoFree',
    workspace: 'Create workspace',
    firstCampaign: 'Add your first campaign',
    approvedCampaign: 'Get it live on Phoenix',
    firstShare: 'Share your first link',
  },
  nav: {
    menu: 'Menu',
    signOut: 'Sign out',
    groups: { campaigns: 'Campaigns', growth: 'Growth', organisation: 'Organisation' },
    items: { campaigns: 'Campaigns', newCampaign: 'New campaign', sharing: 'Sharing', workspace: 'Workspace' },
  },
  status: {
    live: 'Live',
    review: 'In review',
    paused: 'Paused',
    rejected: 'Rejected',
    scheduled: 'Scheduled',
    ended: 'Ended',
    draft: 'Draft',
    pending: 'Pending approval',
    approved: 'Approved',
    declined: 'Declined',
  },
  page: {
    campaigns: {
      title: 'Campaigns',
      subtitle: 'Everything this workspace is running on Phoenix. The one that matters most is at the top.',
    },
    newCampaign: {
      title: 'New campaign',
      subtitle: 'One form. Your offer goes live on Phoenix once Global approves it, usually within a working day.',
    },
    sharing: {
      title: 'Sharing',
      subtitle:
        'Phoenix users share your offers with a link only they hold. When a friend opens it and claims, the chain shows here.',
    },
    workspace: {
      title: 'Workspace',
      subtitle: 'The name, type and billing country Global sees. Invoices will use the billing country.',
    },
    review: {
      title: 'Review',
      subtitle: 'Approve workspaces first, then campaigns. Nothing goes live on Phoenix without a decision here.',
    },
    advertisers: {
      title: 'Advertisers',
      subtitle: 'Every workspace on OshoFree, its status and what it is running.',
    },
    api: {
      title: 'Phoenix API',
      subtitle: 'What Phoenix pulls, what it posts back, and how often.',
    },
  },
} as const
