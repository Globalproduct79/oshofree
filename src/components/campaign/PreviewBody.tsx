import { useId, type KeyboardEvent } from 'react'
import { PhoneFrame } from '@/components/campaign/PhoneFrame'
import { moveTab, PREVIEW_TABS, tabApplies, type PreviewTab } from '@/components/campaign/preview-tabs'
import { Button, CreativeMedia } from '@/components/og'
import { COPY } from '@/lib/copy'
import { PLACEMENT_LABEL } from '@/lib/copy-components'
import { previewLanding, previewShareSheet, shareMessage } from '@/lib/landing/preview'
import { MARKETS } from '@/lib/markets'
import type { PreviewCampaign, PreviewOffer } from '@/lib/preview-merge'

const P = COPY.preview
const LABEL: Record<PreviewTab, string> = { ...PLACEMENT_LABEL, ...P.tabs }

export type LiveState = 'loading' | 'failed' | 'ready'

type Props = {
  campaign: PreviewCampaign
  tab: PreviewTab
  // The offers live in the campaign's country now, drawn around it on the wall.
  live: PreviewOffer[]
  state: LiveState
  onTab: (tab: PreviewTab) => void
  onClose: () => void
}

// The real landing page (lib/landing/render, as /o/[code] serves it), or its share section, in the phone: laid out at a phone's width and
// drawn at the screen's. Sandboxed with nothing allowed, so it runs no script, submits no form and opens nothing; its
// controls are inert anyway, and the routes they name refuse (/o/preview).
function PagePhone({ html, title }: { html: string; title: string }) {
  return (
    <div className="phone">
      <div className="notch" />
      <div className="pv-page">
        <iframe title={title} srcDoc={html} sandbox="" />
      </div>
    </div>
  )
}

// What a tab draws: the phone, then a line about it and anything it adds beside the phone.
function Stage({ c, tab, live }: { c: PreviewCampaign; tab: PreviewTab; live: PreviewOffer[] }) {
  if (tab === 'landing') return <PagePhone html={previewLanding(c, 'offer')} title={P.landingFrame} />
  if (tab === 'share') return <PagePhone html={previewShareSheet(c)} title={P.shareFrame} />
  return <PhoneFrame mine={c} live={live} country={MARKETS[c.country].name} />
}

function Side({ c, tab }: { c: PreviewCampaign; tab: PreviewTab }) {
  if (tab === 'landing') return <p>{P.inert}</p>
  if (tab === 'share')
    return (
      <>
        <b className="subt">{P.message}</b>
        <p className="msg">{shareMessage(c)}</p>
        <p>{P.sample}</p>
      </>
    )
  return (
    <>
      {tab === 'video' && <CreativeMedia image={null} video={c.creative.video} labels={{ image: '', video: P.clip }} controls className="cr" />}
      <p className="ex">{P.explainer}</p>
    </>
  )
}

// The preview's body (Prompt 7): the format tabs, then the chosen one's phone beside a line about it. A placement that
// is not the campaign's stays in the list, off, saying so. Every tab draws the campaign's own data and creative.
export function PreviewBody({ campaign: c, tab, live, state, onTab, onClose }: Props) {
  const id = useId()
  const tabId = (t: PreviewTab) => `${id}-tab-${t}`
  const panelId = `${id}-panel`
  const wall = tab !== 'landing' && tab !== 'share'
  const note = !wall ? null : state === 'loading' ? P.loading : state === 'failed' ? P.failed : null

  function onKey(e: KeyboardEvent) {
    const next = moveTab(tab, e.key, c.placement)
    if (!next) return
    e.preventDefault()
    onTab(next)
    document.getElementById(tabId(next))?.focus()
  }

  return (
    <>
      <div className="tabs" role="tablist" aria-label={P.tabsLabel} onKeyDown={onKey}>
        {PREVIEW_TABS.map((t) => {
          const on = tabApplies(t, c.placement)
          return (
            <button
              key={t}
              type="button"
              role="tab"
              id={tabId(t)}
              aria-selected={t === tab}
              aria-controls={panelId}
              tabIndex={t === tab ? 0 : -1}
              disabled={!on}
              className="tab"
              onClick={() => onTab(t)}
            >
              {LABEL[t]}
              {!on && (
                <>
                  {' '}
                  <i>{P.notThisPlacement}</i>
                </>
              )}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)} tabIndex={0} className="prev">
        <div className="pv-stage">
          <Stage c={c} tab={tab} live={live} />
        </div>
        <div className="pv-side">
          <p>{P.lines[tab]}</p>
          <Side c={c} tab={tab} />
          {note && <p role="status">{note}</p>}
          <Button type="button" variant="dark" onClick={onClose}>
            {P.close}
          </Button>
        </div>
      </div>
    </>
  )
}
