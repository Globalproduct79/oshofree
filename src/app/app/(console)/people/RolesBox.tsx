import { Box } from '@/components/og'
import { PEOPLE } from '@/lib/copy-people'

// "What each role can do" (ADV §9): on People, and beside the invite form where the role is chosen. One line per
// role: the role, then what it may do.
export function RolesBox() {
  return (
    <Box title={PEOPLE.rolesBox}>
      <div className="rolesx">
        {PEOPLE.roleDescriptions.map(([r, d]) => (
          <div key={r} className="r">
            <b>{r}</b>
            <span>{d}</span>
          </div>
        ))}
      </div>
    </Box>
  )
}
