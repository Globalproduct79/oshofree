import { COMPONENTS } from '@/lib/copy-components'
import { tokens } from '@/lib/tokens'

// Top sharers: rank circle, masked phone in monospace, claims on the right.
export function Leaderboard({ rows }: { rows: readonly { phone: string; claims: number }[] }) {
  if (rows.length === 0)
    return <p style={{ color: tokens.ink3, fontSize: 13 }}>{COMPONENTS.leaderboard.empty}</p>
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className="lead">
          <span className="rk">{i + 1}</span>
          <span className="ph">{r.phone}</span>
          <span className="v">{COMPONENTS.leaderboard.claims(r.claims)}</span>
        </div>
      ))}
    </>
  )
}
