import { DEMO } from '@/lib/copy-demo'

// The small grey "Demo" pill beside a demo workspace's name (Prompt 9): the seed made it, and `npm run demo:remove`
// deletes it. The sidebar head, the switcher, Platform › Advertisers and an advertiser's page, and Review's cards.
export function DemoPill() {
  return (
    <span className="dm" title={DEMO.footer}>
      {DEMO.pill}
    </span>
  )
}
