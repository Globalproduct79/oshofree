import { Check } from 'lucide-react'
import { COPY } from '@/lib/copy'
import { tokens } from '@/lib/tokens'

export function SetupChecklist({ items }: { items: { label: string; done: boolean }[] }) {
  const done = items.filter((i) => i.done).length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0
  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: tokens.card, borderColor: tokens.line }}
    >
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold" style={{ color: tokens.ink }}>
          {COPY.setup.title}
        </p>
        <p className="text-xs" style={{ color: tokens.ink3 }}>
          {done}/{items.length}
        </p>
      </div>
      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={items.length}
        className="mt-3 h-1.5 overflow-hidden rounded-full"
        style={{ backgroundColor: tokens.line2 }}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: tokens.accent }} />
      </div>
      <ul className="mt-4 flex flex-col gap-2.5">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2.5 text-[13px]" data-done={i.done}>
            <span
              className="flex size-4 shrink-0 items-center justify-center rounded-full border"
              style={{
                borderColor: i.done ? tokens.green : tokens.line,
                backgroundColor: i.done ? tokens.green : 'transparent',
                color: tokens.card,
              }}
            >
              {i.done && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span style={{ color: i.done ? tokens.ink3 : tokens.ink }}>{i.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
