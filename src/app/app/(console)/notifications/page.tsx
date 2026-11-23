import { Box } from '@/components/og'
import { PageHead } from '@/components/shell/PageHead'
import { NOTIFICATIONS_PAGE as T } from '@/lib/copy-notifications-page'
import { SHELL } from '@/lib/copy-shell'
import { ageLabel } from '@/lib/format'
import { getPrefs, listNotifications } from '@/lib/notifications'
import { can, requireMember } from '@/lib/permissions'
import { PrefsClient } from './PrefsClient'

export default async function NotificationsPage() {
  const { user, workspace, role } = await requireMember('view')
  // Global's own notifications are not tied to a workspace (same as its bell).
  const [prefs, rows] = await Promise.all([
    getPrefs(user.id, workspace.id),
    listNotifications(user.id, role === 'Global' ? null : workspace.id, 20),
  ])
  const now = new Date()
  return (
    <>
      <PageHead
        crumb={[{ label: workspace.name }, { label: SHELL.groups.organisation }, { label: T.crumb }]}
        title={T.title}
        lead={T.lead}
      />
      <div className="two">
        <Box title={T.prefsBox}>
          <PrefsClient initial={prefs} canEdit={can(role, 'settings')} />
        </Box>
        <Box title={T.recentBox}>
          {rows.length === 0 ? (
            <div className="sub">{T.empty}</div>
          ) : (
            rows.map((n) => (
              <div key={n.id} className="tog">
                <div>
                  <b>{n.title}</b>
                  <small>{SHELL.bell.line(n.detail, ageLabel(n.createdAt, now))}</small>
                </div>
              </div>
            ))
          )}
        </Box>
      </div>
    </>
  )
}
