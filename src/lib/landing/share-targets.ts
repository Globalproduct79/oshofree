export type ShareTargets = { whatsapp: string; sms: string; x: string }

// The plain share URLs each medium opens, carrying the text followed by the link.
export function shareTargets(url: string, text: string): ShareTargets {
  const encoded = encodeURIComponent(`${text} ${url}`)
  return {
    whatsapp: `https://wa.me/?text=${encoded}`,
    sms: `sms:?&body=${encoded}`,
    x: `https://twitter.com/intent/tweet?text=${encoded}`,
  }
}
