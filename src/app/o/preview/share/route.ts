import { refusePreview } from '@/lib/landing/refuse-preview'

// A preview's share buttons have no link at all; this answers anyone who types one: refused, nothing recorded.
export const GET = refusePreview
export const POST = refusePreview
