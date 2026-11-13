import { COPY } from '@/lib/copy'
import type { ShareTargets } from '@/lib/landing/share-targets'
import { landingCss } from '@/lib/landing/styles'
import { tokens } from '@/lib/tokens'

// Plain template strings, not React: Next refuses react-dom/server inside a route handler.
// Every value that came from a person goes through esc(); the page carries no script at all.

export type LandingView = {
  state: 'offer' | 'code' | 'shared' | 'ended' | 'error'
  code: string
  brand: string
  headline: string
  description: string
  imageUrl: string | null
  color: string | null
  rewardLabel: string
  endsAtText: string
  redeemMethod: 'code' | 'link'
  claimCode?: string
  myUrl?: string
  shareTargets?: ShareTargets
  error?: string
}

const L = COPY.landing
const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ENTITIES[c])
}

// The Lucide gift, as the Phoenix card shows it.
const GIFT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 7v14"/><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/>' +
  '<path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5"/>' +
  '<rect x="3" y="7" width="18" height="4" rx="1"/></svg>'

function initials(brand: string) {
  const letters = brand.split(/\s+/).filter(Boolean).map((w) => w[0]).join('')
  return letters.slice(0, 2).toUpperCase() || '?'
}

function art(v: LandingView) {
  if (v.imageUrl) return `<img class="art" src="${esc(v.imageUrl)}" alt="" width="480" height="270">`
  const color = v.color ?? tokens.tileColors[0]
  return `<div class="art tile" style="background:${esc(color)}" aria-hidden="true">${esc(initials(v.brand))}</div>`
}

const reward = (label: string) => `<p class="reward">${GIFT}${esc(label)}</p>`

function claim(v: LandingView) {
  if (v.state === 'code' && v.claimCode)
    return `<p class="code"><small>${esc(L.yourCode)}</small>${esc(v.claimCode)}</p>`
  const label = v.redeemMethod === 'code' ? L.showCode : L.openOffer
  return `<form method="post" action="/o/${esc(v.code)}/claim"><button class="btn primary">${esc(label)}</button></form>`
}

function detailsForm(v: LandingView) {
  return [
    `<p class="lead">${esc(L.shareLead)}</p>`,
    `<form method="post" action="/o/${esc(v.code)}/details">`,
    v.error ? `<p class="error" role="alert">${esc(v.error)}</p>` : '',
    `<label for="name">${esc(L.nameLabel)}</label>`,
    '<input id="name" name="name" autocomplete="name" maxlength="80">',
    `<label for="phone">${esc(L.phoneLabel)}</label>`,
    '<input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="20" required>',
    `<button class="btn secondary">${esc(L.getLink)}</button></form>`,
  ].join('')
}

function yourLink(url: string, t: ShareTargets) {
  const button = (href: string, label: string) => `<a class="btn secondary" href="${esc(href)}">${esc(label)}</a>`
  return [
    `<h3>${esc(L.yourLink)}</h3>`,
    `<div class="stack">${button(t.whatsapp, L.whatsapp)}${button(t.sms, L.sms)}${button(t.x, L.x)}</div>`,
    `<label for="mylink">${esc(L.copyLabel)}</label>`,
    `<input id="mylink" readonly value="${esc(url)}">`,
  ].join('')
}

function share(v: LandingView) {
  const mine = v.state === 'shared' && v.myUrl && v.shareTargets ? yourLink(v.myUrl, v.shareTargets) : detailsForm(v)
  return `<section><h2>${esc(L.shareTitle)}</h2>${reward(v.rewardLabel)}${mine}</section>`
}

function offer(v: LandingView) {
  return [
    art(v),
    `<p class="brand">${esc(v.brand)}</p>`,
    `<h1>${esc(v.headline)}</h1>`,
    `<p class="desc">${esc(v.description)}</p>`,
    reward(v.rewardLabel),
    `<p class="ends">${esc(L.ends(v.endsAtText))}</p>`,
    claim(v),
    share(v),
  ].join('')
}

function status(v: LandingView) {
  const brand = v.brand ? `<p class="brand">${esc(v.brand)}</p>` : ''
  return `<div class="status">${brand}<p>${esc(v.state === 'ended' ? L.ended : L.error)}</p></div>`
}

function title(v: LandingView) {
  if (v.state !== 'ended' && v.state !== 'error') return L.title(v.brand, v.headline)
  const said = v.state === 'ended' ? L.ended : L.error
  return v.brand ? L.title(v.brand, said) : said
}

export function renderLanding(v: LandingView): string {
  const body = v.state === 'ended' || v.state === 'error' ? status(v) : offer(v)
  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">' +
    `<title>${esc(title(v))}</title><style>${landingCss}</style></head>` +
    `<body><main>${body}</main></body></html>`
  )
}
