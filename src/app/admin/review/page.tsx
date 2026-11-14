import { OfferCard } from '@/components/campaign/OfferCard'
import { PreviewButton } from '@/components/campaign/PreviewButton'
import { PageHead } from '@/components/console/PageHead'
import { campaignCard, previewOffer } from '@/lib/campaign-card'
import { checkLink } from '@/lib/link-check'
import { COPY } from '@/lib/copy'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { tokens } from '@/lib/tokens'
import {
  approveCampaignAction, approveWorkspaceAction, declineWorkspaceAction, previewOffersAction, rejectCampaignAction,
} from './actions'
import { DecisionButtons } from './decision-buttons'

const LICENCE_WORDS = /licen|approv|NLRC|BCLB|LONASE|GBT/i
const DRAW_WORDS = /draw|jackpot/i

function needsLicence(c: { category: string; headline: string }) {
  return /bet/i.test(c.category) || DRAW_WORDS.test(c.headline)
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-lg font-semibold" style={{ color: tokens.ink }}>
        {title} <span style={{ color: tokens.ink3 }}>{count}</span>
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

const Empty = () => (
  <p className="text-sm" style={{ color: tokens.ink2 }}>
    {COPY.review.empty}
  </p>
)

const rowStyle = { backgroundColor: tokens.card, borderColor: tokens.line, borderRadius: tokens.radius }

// Gated here as well as in the layout: Next can render a page without its layout.
export default async function ReviewPage() {
  await requireAdmin()
  const [workspaces, campaigns] = await Promise.all([
    db.workspace.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      include: { members: { where: { role: 'Owner' }, include: { user: { select: { name: true, email: true } } } } },
    }),
    db.campaign.findMany({
      where: { status: 'review' },
      orderBy: { submittedAt: 'asc' },
      include: { workspace: { select: { name: true, status: true } } },
    }),
  ])
  const links = await Promise.all(
    campaigns.map((c) => (c.redeemMethod === 'link' && c.linkUrl ? checkLink(c.linkUrl) : null)),
  )

  return (
    <>
      <PageHead title={COPY.page.review.title} subtitle={COPY.page.review.subtitle} />
      <Section title={COPY.review.advertisersTitle} count={workspaces.length}>
        {workspaces.length === 0 && <Empty />}
        {workspaces.map((w) => {
          const owner = w.members[0]?.user
          return (
            <div key={w.id} className="flex flex-col gap-3 border p-4" style={rowStyle}>
              <div>
                <p className="font-semibold" style={{ color: tokens.ink }}>{w.name}</p>
                <p className="text-sm" style={{ color: tokens.ink2 }}>
                  {w.type} · {w.country}
                  {owner && ` · ${COPY.review.owner(owner.name, owner.email)}`}
                </p>
              </div>
              <DecisionButtons
                approve={approveWorkspaceAction.bind(null, w.id)}
                deny={declineWorkspaceAction.bind(null, w.id)}
                denyLabel={COPY.review.decline}
                confirmLabel={COPY.review.confirmDecline}
              />
            </div>
          )
        })}
      </Section>
      <Section title={COPY.review.campaignsTitle} count={campaigns.length}>
        {campaigns.length === 0 && <Empty />}
        {campaigns.map((c, i) => {
          const link = links[i]
          const licence = needsLicence(c) ? LICENCE_WORDS.test(c.description) : null
          const card = campaignCard(c)
          return (
            <div key={c.id} className="grid gap-4 border p-4 sm:grid-cols-[220px_1fr]" style={rowStyle}>
              <OfferCard offer={card} />
              <div className="flex flex-col gap-3">
                <div>
                  <p className="font-semibold" style={{ color: tokens.ink }}>{c.name}</p>
                  <p className="text-sm" style={{ color: tokens.ink2 }}>
                    {c.workspace.name} · {c.country} · {c.category}
                  </p>
                </div>
                <p className="text-sm" style={{ color: tokens.ink2 }}>{COPY.review.checklist}</p>
                <p className="flex flex-wrap gap-x-4 text-sm font-medium">
                  {link && (
                    <span style={{ color: link === 'ok' ? tokens.green : tokens.red }}>
                      {link === 'ok' ? COPY.review.linkOk : COPY.review.linkBroken}
                    </span>
                  )}
                  {licence !== null && (
                    <span style={{ color: licence ? tokens.green : tokens.red }}>
                      {licence ? COPY.review.licenceOk : COPY.review.licenceMissing}
                    </span>
                  )}
                </p>
                {c.workspace.status !== 'approved' && (
                  <p className="text-sm font-medium" style={{ color: tokens.amber }}>
                    {COPY.review.approveWorkspaceFirst}
                  </p>
                )}
                <DecisionButtons
                  approve={approveCampaignAction.bind(null, c.id)}
                  deny={rejectCampaignAction.bind(null, c.id)}
                  denyLabel={COPY.review.reject}
                  confirmLabel={COPY.review.confirmReject}
                  hideApprove={c.workspace.status !== 'approved'}
                  extra={
                    <PreviewButton
                      size="s"
                      label={COPY.review.preview}
                      mine={previewOffer(c)}
                      country={c.country}
                      load={previewOffersAction.bind(null, c.country)}
                    />
                  }
                />
              </div>
            </div>
          )
        })}
      </Section>
    </>
  )
}
