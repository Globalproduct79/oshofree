import { tokens } from '@/lib/tokens'

// The red-bordered pink box with a bold red lead (Billing's "Credit limit reached.").
export function AlertBox({ lead, children }: { lead: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="box" style={{ borderColor: tokens.red, background: tokens.redSoft }}>
      <b style={{ color: tokens.red }}>{lead}</b> {children}
    </div>
  )
}
