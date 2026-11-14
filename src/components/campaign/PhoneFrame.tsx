import { CreativeMedia } from '@/components/og'
import { initials } from '@/lib/format'
import { COPY } from '@/lib/copy'
import { CATEGORIES } from '@/lib/markets'
import { previewWall, type PreviewOffer } from '@/lib/preview-merge'
import { tokens } from '@/lib/tokens'

const P = COPY.preview
// Inside the phone a creative is the picture the captions describe: nothing more for a screen reader to say.
const SILENT = { image: '', video: '' }

// A grid tile: the image or the video's first frame filling 50 px, else the tile colour with the initials (the
// prototype's cover()), the colour the real wall falls back to when the offer has none.
function Tile({ o }: { o: PreviewOffer }) {
  const { image, video, color } = o.creative
  return <CreativeMedia image={image} video={video} labels={SILENT} color={color ?? tokens.tileColors[0]} className="tl" fallback={initials(o.brand)} />
}

// The featured slot: the image (up to 100 px) or the clip at its first frame, with a play badge; else a 70 px colour
// block with the initials.
function Featured({ o, mine }: { o: PreviewOffer; mine: boolean }) {
  const label = o.placement === 'splash' ? P.splashLabel : P.featuredLabel
  const { image, video, color } = o.creative
  return (
    <div className={mine ? 'feat mine' : 'feat'}>
      <CreativeMedia
        image={image}
        video={video}
        labels={SILENT}
        fallback={
          <div className="tl" style={{ background: color ?? tokens.tileColors[0] }}>
            {initials(o.brand)}
          </div>
        }
      />
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

// A splash takes the whole screen: the creative, the brand, and a way out. A video opens at its first frame and plays
// with the browser's controls; `still` (the form's small phone) shows that frame only.
function Splash({ o, still }: { o: PreviewOffer; still?: boolean }) {
  const { image, video } = o.creative
  return (
    <div className="splash" style={{ background: o.creative.color ?? undefined }}>
      <CreativeMedia image={image} video={video} labels={SILENT} controls={!still} fallback={<span className="ini">{initials(o.brand)}</span>} />
      <span className="skip">{P.skip}</span>
    </div>
  )
}

// The inside of the phone: Phoenix's More → Offers screen with the previewed campaign among the live offers.
export function PhoneScreen({ mine, live, country, still }: { mine: PreviewOffer; live: PreviewOffer[]; country: string; still?: boolean }) {
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
              <Tile o={o} />
              <div className="bd">
                <div className="br">{P.tileBrand(o.brand)}</div>
                <div className="ti">{o.headline || P.headline}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {mine.placement === 'splash' && <Splash o={mine} still={still} />}
    </>
  )
}

export function PhoneFrame(props: { mine: PreviewOffer; live: PreviewOffer[]; country: string; still?: boolean }) {
  return (
    <div className="phone">
      <div className="notch" />
      <PhoneScreen {...props} />
    </div>
  )
}

// The same phone at 40% (104 × 192): the campaign form's splash preview. Not interactive inside; the caller's
// View full size opens it at full size.
export function PhoneThumb({ mine, country, label }: { mine: PreviewOffer; country: string; label: string }) {
  return (
    <div className="phone-thumb" role="img" aria-label={label}>
      <div inert>
        <PhoneFrame mine={mine} live={[]} country={country} still />
      </div>
    </div>
  )
}
