// This server's own address (APP_URL) in front of a path: the base of every URL another host or person is handed —
// the offers feed's creatives and click-throughs, share links, invite links, the demo wall's calls. A base written
// with a trailing slash gives the same URL as one without; no base is a misconfiguration that fails loudly, never a
// relative or "undefined/…" link sent to Phoenix or a consumer. In production the base must be the public https://
// origin: a loopback or plain-http base would hand Phoenix and consumers links that open nowhere, so it is refused
// (APP_URL_ALLOW_INSECURE=1 lets a local `next start` run on http://localhost). No server-only import: the seed
// builds links under tsx too.
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|0\.0\.0\.0)$/i

export function appUrl(path = ''): string {
  const base = process.env.APP_URL?.trim().replace(/\/+$/, '')
  if (!base) throw new Error('APP_URL is not set: links and creative URLs handed to another host need this server\'s address')
  if (process.env.NODE_ENV === 'production' && process.env.APP_URL_ALLOW_INSECURE !== '1') {
    const url = URL.canParse(base) ? new URL(base) : null
    if (url?.protocol !== 'https:' || LOOPBACK.test(url.hostname))
      throw new Error(`APP_URL must be the public https:// origin in production, not ${base}`)
  }
  return `${base}${path}`
}

// Whether this server is reached over https (the landing page's visitor cookie is then marked Secure).
export const appIsHttps = (): boolean => appUrl().startsWith('https://')
