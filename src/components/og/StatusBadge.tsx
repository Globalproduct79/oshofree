import { STATUS_LABEL, type StatusKey } from '@/lib/copy-components'

export type { StatusKey }

// The `.st` pill with its coloured dot; colours come from `.st-<status>` (GLB §2.7, §6.2).
export function StatusBadge({ status }: { status: StatusKey }) {
  return <span className={`st st-${status}`}>{STATUS_LABEL[status]}</span>
}
