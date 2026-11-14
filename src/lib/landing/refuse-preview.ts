import { previewOnlyView } from '@/lib/landing/preview'
import { html } from '@/lib/landing/respond'

// Every /o/preview route (the preview's forms, its share buttons, its sample link): whatever arrives, it reads no
// link, sets no cookie, counts no visit, issues no code and mints no link. It answers that this was a preview.
export async function refusePreview(): Promise<Response> {
  return html(previewOnlyView(), 403)
}
