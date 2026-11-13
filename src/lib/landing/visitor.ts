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

// Only the salted hash is ever stored; the raw address goes no further than this function.
export function ipHash(req: Request): string {
  const salt = process.env.IP_HASH_SALT || 'dev-salt'
  return createHash('sha256').update(clientIp(req) + salt).digest('hex')
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
