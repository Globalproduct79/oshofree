// The Notifications settings page (ADV §11), verbatim. Five kinds are switchable; the other two
// (review, system) are always on.
import type { NotificationKind } from '@prisma/client'

export const NOTIFICATIONS_PAGE = {
  crumb: 'Notifications',
  title: 'Notifications',
  lead: 'What we tell you, and where.',
  // The head's link back to Campaigns home (there is no "mark all read").
  home: 'Home',
  prefsBox: 'Email and in-app',
  recentBox: 'Recent',
  empty: 'Nothing new.',
  // Ours (Prompt 10): a flip that did not reach the server goes back, and says so.
  saveFailed: "That setting didn't save. Try again.",
  prefs: [
    { kind: 'approved', label: 'Campaign approved or rejected', sub: 'The decision and, if rejected, why' },
    { kind: 'credit', label: 'Credit limit reached or invoice due', sub: 'Campaigns pause at the limit' },
    { kind: 'pace', label: 'Budget finishing early or late', sub: 'When pace drifts more than 20%' },
    { kind: 'ended', label: 'Campaign ended', sub: 'Final numbers' },
    { kind: 'weekly', label: 'Weekly digest', sub: 'Every Monday, all campaigns' },
  ] as { kind: NotificationKind; label: string; sub: string }[],
}
