// People page (ADV §9), the invite page, and the team and invite lists People shares with Organisation › Overview.
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
  linkCopied: 'Invite link copied',
  // A link is shown only to whoever's invite or Resend made it, in a read-only field, never in a toast (it is a
  // credential). When the browser refuses the clipboard, the field stays to copy by hand.
  linkBody: 'Your browser blocked copying. Select the link and copy it, then send it to them.',
  linkLabel: 'Link',
  copy: 'Copy',
  revoke: 'Revoke',
  remove: 'Remove',
  you: 'you',
  roleFor: (name: string) => `Role for ${name}`,
  // An invite's line: its role, who sent it (on a list), and when its link stops working.
  inviteLine: (i: { role: string; by?: string | null; expires: string; expired?: boolean; revoked?: boolean }) =>
    [
      i.role,
      i.by ? `invited by ${i.by}` : null,
      i.revoked ? 'revoked, the link no longer works' : `${i.expired ? 'expired' : 'expires'} ${i.expires}`,
    ]
      .filter(Boolean)
      .join(' · '),
  resend: 'Resend',
  resent: 'New link made. The old one no longer works.',
  inviteGone: 'That invite was already accepted or revoked.',
  lastOwner: "The last Owner can't be demoted.",
  lastOwnerRemove: "The last Owner can't be removed.",
  // Organisation › Invite (/app/people/invite). After sending, the pending invite and its link show on the page,
  // never in a toast.
  invitePage: {
    crumb: 'Invite',
    title: 'Invite someone',
    lead: 'Choose their role and send the invite. You get a link to pass on; they join when they open it and sign in.',
    pendingTitle: 'Pending invitation',
    sent: (email: string) => `Invite sent to ${email}. Copy the link and send it to them.`,
    another: 'Invite another',
    back: 'Back to Organisation',
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
