// People page (ADV §9): the one place for the team and its invites; and the invite page under it.
export const PEOPLE = {
  crumb: 'People',
  title: 'People',
  lead: 'Owners manage billing and people. Managers create and submit campaigns. Viewers see reports.',
  // People's head primary and the invite page's title.
  inviteUser: 'Invite user',
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
  // An invite's line: its role, who sent it (on a list), and when its link stops working; or, once the row is
  // final, that this person revoked it, or that it was already taken up or revoked elsewhere.
  inviteLine: (i: { role: string; by?: string | null; status: 'open' | 'revoked' | 'gone'; expires?: string; expired?: boolean }) =>
    [
      i.role,
      i.by ? `invited by ${i.by}` : null,
      i.status === 'revoked'
        ? 'revoked, the link no longer works'
        : i.status === 'gone'
          ? 'already accepted or revoked'
          : `${i.expired ? 'expired' : 'expires'} ${i.expires}`,
    ]
      .filter(Boolean)
      .join(' · '),
  resend: 'Resend',
  resent: 'New link made. The old one no longer works.',
  inviteGone: 'That invite was already accepted or revoked.',
  lastOwner: "The last Owner can't be demoted.",
  lastOwnerRemove: "The last Owner can't be removed.",
  // Organisation › People › Invite (/app/people/invite). After sending, the pending invite and its link show on the
  // page, never in a toast.
  invitePage: {
    crumb: 'Invite',
    title: 'Invite user',
    lead: 'Choose their role and send the invite. You get a link to pass on; they join when they open it and sign in.',
    pendingTitle: 'Pending invitation',
    sent: (email: string) => `Invite sent to ${email}. Copy the link and send it to them.`,
    another: 'Invite another',
    back: 'Back to People',
  },
  rolesBox: 'What each role can do',
  roleDescriptions: [
    ['Owner', 'Everything, including invoices, credit and people'],
    ['Manager', 'Create, submit, edit, pause campaigns; see reports'],
    ['Viewer', 'Reports and invoices, read-only'],
  ],
} as const

// The invite page (/invite/[token]), and what sign-up, sign-in and the workspace's home say about an invite.
export const INVITE_PAGE = {
  headline: (who: string, workspace: string, role: string) => `${who} invited you to ${workspace} as ${role}.`,
  invalid: 'This invite is no longer valid.',
  // Under it: what to do about it, and on sign-in or sign-up a way on without the invite.
  askForNew: 'Ask the person who invited you for a new link.',
  signInWithout: 'Sign in without the invite',
  signUpWithout: 'Create an account without the invite',
  // Signed in as someone who is already a member: the invite is left for whoever it was meant for.
  alreadyIn: (workspace: string) => `You're already in ${workspace}.`,
  open: (workspace: string) => `Open ${workspace}`,
  createAccount: 'Create an account',
  signIn: 'Sign in',
  // Already signed in: whose account the invite would join, or sign out and sign in with another.
  signedInAs: (name: string, email: string) => `You're signed in as ${name} (${email}).`,
  acceptAs: (name: string) => `Accept as ${name}`,
  signInOther: 'Sign in as someone else',
  // Sign-up and sign-in opened from an invite link, and the toast on the workspace's home once joined.
  joining: (workspace: string, role: string) => `You're joining ${workspace} as ${role}.`,
  joined: (workspace: string, role: string) => `You've joined ${workspace} as ${role}.`,
} as const
