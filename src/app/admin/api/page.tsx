import { PageHead } from '@/components/console/PageHead'
import { ENDPOINTS } from '@/lib/api-docs'
import { COPY } from '@/lib/copy'
import { DevKeyBox, EndpointSection, ErrorsSection, RulesSection } from './sections'

export default function ApiDocsPage() {
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
