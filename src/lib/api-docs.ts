import { API_COPY } from '@/lib/copy-api'
import { tokens } from '@/lib/tokens'

// The Phoenix API page's boxes (GLB §2.6) as data, so the page is markup only. The prose is the
// prototype's, with OshoFree's own paths; where the prototype describes a wire format OshoFree does not
// use (the share token, the events reply), the box says what this API does. "Link stats" is OshoFree's
// own endpoint, which the prototype does not document. Field names and errors
// mirror src/app/api/v1 and src/lib/{offers,events,claims,link-events}.ts.
// In prose, `backticks` mark an inline token (.tok). Code blocks are highlighted by the page.

export type DocBox = {
  id: string
  title: string
  sub?: string
  code?: string
  rows?: readonly (readonly [string, string])[]
}

const TOKEN = 'K4Q7ZX2A'

export function contractBoxes(base: string): DocBox[] {
  const api = `${base}/api/v1`
  return [
    {
      id: 'offers',
      title: '1 · Offers out',
      sub: 'Phoenix polls this every 15 minutes per country and renders the cards in More → Offers. Only approved, in-flight campaigns with budget left are returned, ordered by placement then remaining budget. Every URL is absolute, on this server. `creative.image` fills a card, featured or splash slot; `creative.video` is an MP4 for a video or splash slot; with neither, draw `creative.color` with the brand\'s initials. `cta.type` is the redeem method: `code` asks `POST /api/v1/claims` at claim time, `link` opens `cta.url`, our landing page, which sends the user on to the brand. The share URL is the sharer\'s own, from `POST /api/v1/share`, never the feed.',
      code: [
        `GET ${api}/offers?country=KE&channel=phoenix`,
        'Authorization: Bearer <channel key>',
        '',
        '{',
        '  "country": "KE", "generated_at": "2026-11-07T10:00:00Z", "ttl_seconds": 900,',
        '  "offers": [{',
        '    "id": "cmp_8f3a", "placement": "featured", "brand": "777Bet",',
        '    "headline": "Supa10 Jackpot — KSh 5M kwa buku tu",',
        '    "description": "Predict 10 matches for KSh 100…", "category": "Betting",',
        `    "creative": { "image": "${base}/uploads/supa10.jpg", "video": null, "color": "${tokens.tileColors[2]}" },`,
        `    "cta": { "label": "${API_COPY.ctaLabel}", "type": "link", "url": "${base}/o/R7KQ2XA9?go=claim" },`,
        '    "flags": { "sponsored": true, "age_18": true },',
        '    "share": { "enabled": true, "reward_label": "Earn KSh10 airtime" },',
        '    "ends_at": "2026-11-17T00:00:00+03:00"',
        '  }]',
        '}',
      ].join('\n'),
    },
    {
      id: 'events',
      title: '2 · Events in',
      sub: "Phoenix's SDK batches events and posts them at most every 60 seconds. We de-duplicate on `session_id + offer_id + type` per hour. Impressions must meet 50% in view for 1 s. `open` is a tap on the card; `claim` is the user taking a code or tapping a link offer's button. An event for an offer the feed never listed is counted as ignored.",
      code: [
        `POST ${api}/events`,
        'Authorization: Bearer <channel key>   Idempotency-Key: <uuid>',
        '',
        '{ "channel": "phoenix", "events": [',
        '  { "type": "impression", "offer_id": "cmp_8f3a", "placement": "featured", "country": "KE", "session_id": "anon_…", "ts": "…" },',
        '  { "type": "open",       "offer_id": "cmp_8f3a", … },',
        '  { "type": "claim",      "offer_id": "cmp_8f3a", "claim_code": "PHX-3F9K", … },',
        `  { "type": "share",      "offer_id": "cmp_8f3a", "token": "${TOKEN}", "via": "whatsapp", "msisdn_hash": "sha256…", … },`,
        `  { "type": "share_open", "token": "${TOKEN}", "session_id": "anon_friend…", … },`,
        `  { "type": "share_claim","token": "${TOKEN}", "session_id": "anon_friend…", … }`,
        ']}',
        '',
        '→ 202 Accepted  { "accepted": 6, "deduped": 0, "ignored": 0 }',
      ].join('\n'),
    },
    {
      id: 'share',
      title: '3 · Share token',
      sub: `Minted by us when Phoenix calls \`POST /api/v1/share\` with the offer, the session, the medium (\`via\`: whatsapp, sms, x, facebook, copy or other) and the sharer's OTP-verified number (\`msisdn\`, E.164, optional). Format \`${TOKEN}\`, 8 alphanumerics, no ambiguous characters, valid to the campaign end date. The share link is \`${base}/o/<token>\`; it opens OshoFree's offer page, where the friend claims and can get a link of their own. A sharer with a number holds one link per offer, handed back on every share. One sharer earns at most 5 rewards per day per campaign; the friend's session must be a different device.`,
      code: [
        `POST ${api}/share`,
        'Authorization: Bearer <channel key>',
        '',
        '{ "offer_id": "cmp_8f3a", "session_id": "anon_…", "via": "whatsapp", "msisdn": "+254712345678" }',
        '',
        `→ 201 Created  { "code": "${TOKEN}", "url": "${base}/o/${TOKEN}" }`,
      ].join('\n'),
    },
    {
      id: 'stats',
      title: 'Link stats',
      sub: "What one share link has earned so far: opens and claims on OshoFree's offer page, details left, links shared on from it (`children`), and the `share_open` / `share_claim` events you posted for the token (`share_opens`, `share_claims`). Your own channel's links only; any other code is 404 `unknown_link`.",
      code: [
        `GET ${api}/links/${TOKEN}/stats`,
        'Authorization: Bearer <channel key>',
        '',
        '{',
        '  "opens_unique": 14, "opens_all": 21, "details_left": 5, "claims": 3, "children": 2,',
        '  "share_opens": 6, "share_claims": 2',
        '}',
      ].join('\n'),
    },
  ]
}

export const AUTH_AND_LIMITS: DocBox = {
  id: 'auth',
  title: 'Auth and limits',
  rows: [
    ['Auth', 'Bearer key per channel, rotated quarterly'],
    ['Rate limit (planned)', '600 req/min on events, 60 req/min on offers'],
    ['Payload', '≤ 500 events per POST, ≤ 1 MB'],
    ['Retry', 'Idempotency key; 5xx retry with backoff'],
    ['Latency SLO', 'p95 < 300 ms offers, < 500 ms events'],
  ],
}

export const REFERENCE_BOXES: DocBox[] = [
  {
    id: 'claims',
    title: 'Claim codes',
    sub: 'Phoenix requests one at claim time: `POST /api/v1/claims` with `offer_id` and `session_id` → `{ "code": "PHX-3F9K", "valid_until": … }`. One per session per offer per day: asking again that UTC day returns the same code (200, not 201), valid until the day ends at midnight UTC, or the campaign does if sooner. Not validated at the till in MVP; the brand honours them.',
  },
  {
    id: 'webhooks',
    title: 'Webhooks to Phoenix (planned)',
    sub: '`offer.approved`, `offer.paused`, `offer.ended` so Phoenix can refresh before the next poll.',
  },
  {
    id: 'boomplay',
    title: 'Boomplay',
    sub: 'Same contract with `channel=boomplay` and its own key. No changes on the advertiser side.',
  },
]

export const ERRORS: [number, string, string][] = [
  [401, 'unauthorized', 'No bearer key, a wrong or retired key, or the channel is not live.'],
  [400, 'bad_country', 'country is missing or not a supported market.'],
  [400, 'bad_request', "The body or a field fails validation, or msisdn is not a number of the offer's country."],
  [400, 'missing_idempotency_key', 'POST /events without an Idempotency-Key header.'],
  [400, 'too_many_events', 'More than 500 events in one batch.'],
  [400, 'channel_mismatch', "The channel named in the body or the query is not the key's channel."],
  [404, 'unknown_offer', 'No such offer, or for POST /claims one that is not delivering now.'],
  [404, 'unknown_link', 'No such link for this channel.'],
  [409, 'not_delivering', 'POST /share for an offer that is not delivering now.'],
  [500, 'server_error', 'Something failed on our side. Retry with the same Idempotency-Key.'],
]
