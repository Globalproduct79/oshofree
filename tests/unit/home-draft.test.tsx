import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DraftCard, EmptyUnlessDraft } from '@/components/campaign/DraftCard'
import { newCampaignDefaults, type FormValues } from '@/components/campaign/form/values'
import { saveDraft } from '@/lib/draft-store'

// Campaigns home's draft, as the browser draws it after hydration. The node harness has no DOM, so the external store
// is read through its client snapshot (useSyncExternalStore's getSnapshot), which is what the browser renders with;
// the server snapshot (no draft) is what home-page.test.ts renders.
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  return { ...react, useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot() }
})

const kola = { name: 'Kola Bright', type: 'Brand', country: 'NG' } as const
const defaults = newCampaignDefaults(kola, new Date('2026-11-14T09:00:00Z'))
const EMPTY = <div className="box empty">Nothing on Phoenix yet</div>

function browser() {
  const m = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      get length() { return m.size },
      key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
}

const render = () =>
  renderToStaticMarkup(
    <>
      <div className="cards">
        <DraftCard workspaceId="ws1" defaults={defaults} />
      </div>
      <EmptyUnlessDraft workspaceId="ws1" defaults={defaults}>
        {EMPTY}
      </EmptyUnlessDraft>
    </>,
  )

afterEach(() => vi.unstubAllGlobals())

describe('the draft on Campaigns home', () => {
  it('with a draft and no campaigns: the Draft card, and no "Nothing on Phoenix yet" under it', () => {
    browser()
    const draft: FormValues = { ...defaults, name: 'Harmattan sale', headline: 'Harmattan sale: 20% off' }
    saveDraft('ws1', draft)
    const m = render()
    expect(m).toContain('<a class="cc" href="/app/campaigns/new">')
    expect(m).toContain('<span class="st st-draft">Draft</span>')
    expect(m).toContain('Harmattan sale: 20% off')
    expect(m).not.toContain('Nothing on Phoenix yet')
  })

  it('without a draft (or only the untouched defaults): no card, and the empty state', () => {
    browser()
    expect(render()).toBe('<div class="cards"></div><div class="box empty">Nothing on Phoenix yet</div>')
    saveDraft('ws1', defaults)
    expect(render()).toBe('<div class="cards"></div><div class="box empty">Nothing on Phoenix yet</div>')
  })

  it("another workspace's draft is not this one's", () => {
    browser()
    saveDraft('ws2', { ...defaults, name: 'Other' })
    expect(render()).toContain('Nothing on Phoenix yet')
  })
})
