import { PageHead } from '@/components/shell/PageHead'
import { Box, TokenChip } from '@/components/og'
import { AUTH_AND_LIMITS, contractBoxes, REFERENCE_BOXES } from '@/lib/api-docs'
import { hashKey } from '@/lib/channels'
import { API_COPY } from '@/lib/copy-api'
import { db } from '@/lib/db'
import { fd } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { RotateKey } from './RotateKey'
import { DocSection, ErrorsBox, Rich } from './sections'

const K = API_COPY.keys

// Documentation (GLB §2.6), plus the Keys box Global uses to rotate Phoenix's key (spec §6.14.7).
// Gated here as well as in the layout: Next can render a page without its layout.
export default async function ApiDocsPage() {
  await requireAdmin()
  const base = process.env.APP_URL ?? ''
  const now = new Date()
  const phoenix = await db.channel.findUnique({ where: { key: 'phoenix' } })
  // The seeded development key, outside production and only while Phoenix still accepts it.
  const dev = process.env.NODE_ENV !== 'production' ? process.env.DEMO_CHANNEL_KEY : undefined
  const devHash = dev && hashKey(dev)
  const devAccepted =
    phoenix !== null &&
    (devHash === phoenix.apiKeyHash ||
      (devHash === phoenix.previousKeyHash && phoenix.previousKeyValidUntil !== null && phoenix.previousKeyValidUntil > now))

  return (
    <>
      <PageHead crumb={[{ label: 'Platform' }, { label: API_COPY.crumb }]} title={API_COPY.title} lead={API_COPY.lead} />
      <div className="two">
        <div>
          {contractBoxes(base).map((box) => (
            <DocSection key={box.id} box={box} />
          ))}
        </div>
        <div>
          <DocSection box={AUTH_AND_LIMITS} />
          <Box title={K.title} sub={<Rich text={K.environments(base)} />}>
            <table>
              <tbody>
                <tr>
                  <td>
                    <b>{K.channel}</b>
                  </td>
                  <td>{phoenix ? K.created(fd(phoenix.keyCreatedAt, 'UTC')) : K.notSetUp}</td>
                  <td style={{ textAlign: 'right' }}>{phoenix && <RotateKey />}</td>
                </tr>
                {devAccepted && (
                  <tr>
                    <td>{K.devKey}</td>
                    <td colSpan={2}>
                      <TokenChip>{dev}</TokenChip>
                      <div className="sub" style={{ margin: '6px 0 0' }}>
                        {K.devKeyNote}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Box>
          {REFERENCE_BOXES.map((box) => (
            <DocSection key={box.id} box={box} />
          ))}
          <ErrorsBox />
        </div>
      </div>
    </>
  )
}
