import { PageHead } from '@/components/console/PageHead'
import { ENDPOINTS } from '@/lib/api-docs'
import { COPY } from '@/lib/copy'
import { requireAdmin } from '@/lib/session'
import { DevKeyBox, EndpointSection, ErrorsSection, RulesSection } from './sections'

// Gated here as well as in the layout: Next can render a page without its layout.
export default async function ApiDocsPage() {
  await requireAdmin()
  const devKey = process.env.NODE_ENV !== 'production' ? process.env.DEMO_CHANNEL_KEY : undefined
  return (
    <>
      <PageHead title={COPY.page.api.title} subtitle={COPY.page.api.subtitle} />
      {devKey && <DevKeyBox keyValue={devKey} />}
      {ENDPOINTS.map((e) => (
        <EndpointSection key={e.id} e={e} />
      ))}
      <ErrorsSection />
      <RulesSection />
    </>
  )
}
