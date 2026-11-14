import { COPY } from '@/lib/copy'

// Organisation › Overview (/app/organisation): the company, its team and who is still to join. The team and invite
// lists' own words, and Invite user, are People's (copy-people.ts), since both pages show them.
export const ORGANISATION = {
  crumb: 'Overview',
  title: 'Organisation',
  lead: 'Who you are on the platform, who works here, and who is still to join.',
  company: {
    title: 'Company',
    name: 'Name',
    type: 'Type',
    country: 'Country',
    registration: 'Registration number',
    notGiven: 'Not given',
    approval: 'Approval',
    creditLimit: 'Credit limit',
    since: 'Member since',
    clients: 'Client brands',
    noClients: 'No client brands yet.',
    client: (brand: string, campaigns: number) => `${brand} · ${COPY.workspace.clientCount(campaigns)}`,
    edit: 'Edit workspace',
  },
  team: { title: 'Team' },
  pending: { title: 'Pending invitations', empty: 'No one is waiting to join.' },
} as const
