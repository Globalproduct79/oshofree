// People page (ADV §9) and the invite page.
export const PEOPLE = {
  crumb: 'People',
  title: 'People',
  lead: 'Owners manage billing and people. Managers create and submit campaigns. Viewers see reports.',
  // The head's primary: the invite form has its own page.
  inviteSomeone: 'Invite someone',
  members: 'Members',
  openInvites: 'Open invites',
  noOpenInvites: 'No open invites.',
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
  // When the browser refuses the clipboard: the link is shown in a modal, never in a toast (it is a credential).
  linkTitle: 'Invite link',
  linkBody: 'Your browser blocked copying. Select the link and copy it, then send it to them.',
  linkLabel: 'Link',
  copy: 'Copy',
  done: 'Done',
  copyFailed: 'Copy the link above before closing.',
  revoke: 'Revoke',
  remove: 'Remove',
  invited: (role: string) => `Invited · ${role}`,
  lastOwner: "The last Owner can't be demoted.",
  lastOwnerRemove: "The last Owner can't be removed.",
  // People › Invite someone (/app/people/invite). After sending, the link shows on the page, never in a toast.
  invitePage: {
    crumb: 'Invite',
    title: 'Invite someone',
    lead: 'Choose their role and send the invite. You get a link to pass on; they join when they open it and sign in.',
    sent: (email: string) => `Invite sent to ${email}. Copy the link and send it to them.`,
    back: 'Back to People',
  },
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
