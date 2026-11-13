// Does the offer's link answer? HEAD with a 5-second limit; 2xx and 3xx are fine.
export async function checkLink(url: string, fetchImpl: typeof fetch = fetch): Promise<'ok' | 'broken'> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 5000)
  try {
    const res = await fetchImpl(url, { method: 'HEAD', signal: ctl.signal, redirect: 'manual' })
    return res.status >= 200 && res.status < 400 ? 'ok' : 'broken'
  } catch {
    return 'broken'
  } finally {
    clearTimeout(timer)
  }
}
