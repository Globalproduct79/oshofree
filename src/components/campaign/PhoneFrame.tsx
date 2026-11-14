import { initials } from '@/lib/format'
import { COPY } from '@/lib/copy'
import { CATEGORIES } from '@/lib/markets'
import { previewWall, type PreviewOffer } from '@/lib/preview-merge'

const P = COPY.preview

function Visual({ o, height }: { o: PreviewOffer; height: number }) {
  const { image, color } = o.creative
  // eslint-disable-next-line @next/next/no-img-element
  if (image) return <img src={image} alt="" />
  return (
    <div className="tl" style={{ height, background: color ?? undefined }}>
      {initials(o.brand)}
    </div>
  )
}

function Featured({ o, mine }: { o: PreviewOffer; mine: boolean }) {
  const label = o.placement === 'splash' ? P.splashLabel : P.featuredLabel
  return (
    <div className={mine ? 'feat mine' : 'feat'}>
      <Visual o={o} height={70} />
      {o.placement === 'video' && (
        <span className="play" aria-hidden>
          ▶
        </span>
      )}
      <div className="cap">
        <small>{P.caption(label, o.brand, o.ageGated)}</small>
        <b>{o.headline || P.headline}</b>
      </div>
    </div>
  )
}

// A splash takes the whole screen: the creative (a video shows its poster), the brand, and a way out.
function Splash({ o }: { o: PreviewOffer }) {
  return (
    <div className="splash" style={{ background: o.creative.color ?? undefined }}>
      {o.creative.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={o.creative.image} alt="" />
      )}
      {!o.creative.image && <span className="ini">{initials(o.brand)}</span>}
      <span className="skip">{P.skip}</span>
    </div>
  )
}

// The inside of the phone: Phoenix's More → Offers screen with the previewed campaign among the live offers.
export function PhoneScreen({ mine, live, country }: { mine: PreviewOffer; live: PreviewOffer[]; country: string }) {
  const { featured, tiles } = previewWall(mine, live)
  return (
    <>
      <div className="scr">
        <div className="url">{P.url}</div>
        <div className="wh">
          <h2>{P.offers}</h2>
          <span>{country}</span>
        </div>
        <div className="chips">
          {[P.all, ...CATEGORIES.slice(0, 3)].map((c, i) => (
            <span key={c} className={i === 0 ? 'on' : undefined}>
              {c}
            </span>
          ))}
        </div>
        {featured && <Featured o={featured} mine={featured.id === mine.id} />}
        <div className="pg">
          {tiles.map((o) => (
            <div key={o.id} className={o.id === mine.id ? 'pc mine' : 'pc'}>
              <Visual o={o} height={50} />
              <div className="bd">
                <div className="br">{P.tileBrand(o.brand)}</div>
                <div className="ti">{o.headline || P.headline}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {mine.placement === 'splash' && <Splash o={mine} />}
    </>
  )
}

export function PhoneFrame(props: { mine: PreviewOffer; live: PreviewOffer[]; country: string }) {
  return (
    <div className="phone">
      <div className="notch" />
      <PhoneScreen {...props} />
    </div>
  )
}
