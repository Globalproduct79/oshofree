import { switchToPlatformAction } from '@/app/app/(console)/switch/actions'
import { SubmitButton } from '@/components/og/SubmitButton'
import { SHELL } from '@/lib/copy-shell'

export type BannerKind = 'pending' | 'declined' | 'global' | 'globalInside'

// The strip under the topbar (GLB §4.5): a bold orange lead word, then the sentence.
export function Banner({
  kind,
  workspaceName = '',
  reason = null,
}: {
  kind: BannerKind
  workspaceName?: string
  reason?: string | null
}) {
  const b = SHELL.banner
  const [lead, text] =
    kind === 'pending'
      ? [b.pending.lead, b.pending.text]
      : kind === 'declined'
        ? [b.declined.lead, b.declined.text(reason)]
        : kind === 'global'
          ? [b.global.lead, b.global.text]
          : [b.globalInside.lead, b.globalInside.text(workspaceName)]
  return (
    <div className="banner" role="status">
      <b>{lead}</b> {text}
      {kind === 'globalInside' && (
        <form action={switchToPlatformAction} className="ml-auto">
          <SubmitButton plain className="border-0 bg-transparent p-0 text-inherit underline">
            {b.back}
          </SubmitButton>
        </form>
      )}
    </div>
  )
}
