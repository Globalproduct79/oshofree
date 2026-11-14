// People page (ADV §9) and the invite page.
export const PEOPLE = {
  crumb: 'People',
  title: 'People',
  lead: 'Owners manage billing and people. Managers create and submit campaigns. Viewers see reports.',
  members: 'Members',
  invite: 'Invite',
  emailLabel: 'Email',
  emailPlaceholder: 'name@company.com',
  roleLabel: 'Role',
  sendInvite: 'Send invite',
  invalidEmail: 'Enter a valid email',
  inviteSent: 'Invite sent',
  alreadyMember: 'Already a member',
  copyLink: 'Copy invite link',
  linkCopied: 'Invite link copied',
  revoke: 'Revoke',
  remove: 'Remove',
  invited: (role: string) => `Invited · ${role}`,
  lastOwner: "The last Owner can't be demoted.",
  lastOwnerRemove: "The last Owner can't be removed.",
  rolesBox: 'What each role can do',
  roleDescriptions: [
    ['Owner', 'Everything, including invoices, credit and people'],
    ['Manager', 'Create, submit, edit, pause campaigns; see reports'],
    ['Viewer', 'Reports and invoices, read-only'],
  ],
} as const

export const INVITE_PAGE = {
  headline: (who: string, workspace: string, role: string) => `${who} invited you to ${workspace} as ${role}.`,
  invalid: 'This invite is no longer valid.',
  join: (workspace: string) => `Join ${workspace}`,
  createAccount: 'Create an account',
  signIn: 'Sign in',
} as const
