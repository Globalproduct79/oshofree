// This server's own address (APP_URL) in front of a path: the base of every URL another host is handed — the offers
// feed's creatives and click-throughs, share links, the demo wall's calls. A base written with a trailing slash gives
// the same URL as one without; no base is a misconfiguration that fails loudly, never a relative or "undefined/…"
// link sent to Phoenix or a consumer. No server-only import: the seed builds links under tsx too.
export function appUrl(path = ''): string {
  const base = process.env.APP_URL?.trim().replace(/\/+$/, '')
  if (!base) throw new Error('APP_URL is not set: links and creative URLs handed to another host need this server\'s address')
  return `${base}${path}`
}
