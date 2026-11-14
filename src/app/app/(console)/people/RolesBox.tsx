import { Box, DataTable } from '@/components/og'
import { PEOPLE } from '@/lib/copy-people'

// "What each role can do" (ADV §9): on People, and beside the invite form where the role is chosen.
export function RolesBox() {
  return (
    <Box title={PEOPLE.rolesBox}>
      <DataTable head={[]} rows={PEOPLE.roleDescriptions.map(([r, d]) => [<b key={r}>{r}</b>, d])} emptyText="" />
    </Box>
  )
}
