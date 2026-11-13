import { createHash, randomUUID } from 'node:crypto'

const COOKIE = 'og_v'
const YEAR_SECONDS = 31_536_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export type Visitor = { id: string; ipHash: string; userAgent: string; setCookie?: string }

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return undefined
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || req.headers.get('x-real-ip')?.trim() || '0.0.0.0'
}

// A public salt makes the hash reversible over the IPv4 space, so production refuses to run without
// a real one. Checked on use, not at import, so `next build` does not need the secret.
function salt(): string {
  const s = process.env.IP_HASH_SALT
  if (process.env.NODE_ENV === 'production' && (!s || s.length < 16))
    throw new Error('IP_HASH_SALT must be set to at least 16 characters in production')
  return s || 'dev-salt'
}

// Only the salted hash is ever stored; the raw address goes no further than this function.
export function ipHash(req: Request): string {
  return createHash('sha256').update(clientIp(req) + salt()).digest('hex')
}

// Chat apps, social sites and search engines fetch a shared link to draw its preview card. They get
// the page, but they are not a friend opening it.
const PREVIEW_FETCHERS =
  /WhatsApp|facebookexternalhit|Facebot|Twitterbot|TelegramBot|Slackbot|Slack-ImgProxy|Discordbot|LinkedInBot|Googlebot|bingbot|Applebot|iMessageLinkPreview|Pinterest|Embedly|vkShare|redditbot|SkypeUriPreview/i

export function isPreviewFetcher(userAgent: string | null | undefined): boolean {
  return PREVIEW_FETCHERS.test(userAgent ?? '')
}

// Who is asking: the og_v cookie (minted when missing or malformed), hashed IP and user agent.
export function visitor(req: Request): Visitor {
  const existing = readCookie(req, COOKIE)
  const known = existing !== undefined && UUID.test(existing)
  const id = known ? existing : randomUUID()
  const secure = process.env.APP_URL?.startsWith('https://') ? '; Secure' : ''
  return {
    id,
    ipHash: ipHash(req),
    userAgent: (req.headers.get('user-agent') ?? '').slice(0, 512),
    setCookie: known ? undefined : `${COOKIE}=${id}; Max-Age=${YEAR_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure}`,
  }
}
