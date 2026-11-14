export type LinkState = 'ok' | 'broken'

// Does the offer's link answer? HEAD within `timeoutMs` (5 seconds unless the caller is in a hurry); 2xx and
// 3xx are fine, anything else, an error or no answer in time is broken.
export async function checkLink(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 5000): Promise<LinkState> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { method: 'HEAD', signal: ctl.signal, redirect: 'manual' })
    return res.status >= 200 && res.status < 400 ? 'ok' : 'broken'
  } catch {
    return 'broken'
  } finally {
    clearTimeout(timer)
  }
}
