// The Phoenix API documentation as data, so the docs page is markup only.
// Field names and error strings mirror src/app/api/v1 and src/lib/{offers,events,link-events}.ts.

export type Endpoint = {
  id: string
  title: string
  purpose: string
  method: 'GET' | 'POST'
  path: string
  headers: string[]
  body?: unknown
  status: number
  response: unknown
  rules: string[]
}

const AUTH = 'Authorization: Bearer <channel key>'

export const ENDPOINTS: Endpoint[] = [
  {
    id: 'offers',
    title: 'Offers out',
    purpose: 'The offers delivering in a country now. Phoenix pulls these and draws the cards.',
    method: 'GET',
    path: '/api/v1/offers?country=KE',
    headers: [AUTH],
    status: 200,
    response: {
      country: 'KE',
      generated_at: '2026-11-13T09:00:00.000Z',
      ttl_seconds: 900,
      offers: [
        {
          id: 'clx9offer777',
          placement: 'card',
          brand: '777Bet',
          headline: 'Supa10 Jackpot — KSh 5M kwa buku tu',
          description: 'Weka bet yako ya Supa10 na ushinde KSh 5M. 18+. Cheza kwa uwajibikaji.',
          category: 'Betting',
          creative: { image: 'https://oshofree.example/uploads/777bet.jpg', color: null },
          cta: { label: 'Open offer', type: 'link', url: 'https://oshofree.example/o/r7Kq2xA9?go=claim' },
          share: { enabled: true, reward_label: 'KSh 100 bonus' },
          ends_at: '2026-12-01T00:00:00.000Z',
        },
      ],
    },
    rules: [
      'country is one of NG, KE, GH, TZ, SN. Anything else is 400 bad_country.',
      'Poll each country every ttl_seconds (900).',
      'Code offers carry cta.type "code" and the code in cta.label, with cta.url null.',
      'Link offers carry cta.type "link"; cta.url ends in ?go=claim and logs the Claim itself.',
      'Offers carry no share URL. Call POST /share when the user shares.',
    ],
  },
  {
    id: 'share',
    title: 'Share',
    purpose: 'Mints the sharer\'s own link for an offer. Call it at share time, once per share.',
    method: 'POST',
    path: '/api/v1/share',
    headers: [AUTH, 'Content-Type: application/json'],
    body: { offer_id: 'clx9offer777', session_id: 'sess_8f2a', via: 'whatsapp' },
    status: 201,
    response: { code: 'Qm4Zt81c', url: 'https://oshofree.example/o/Qm4Zt81c' },
    rules: [
      'via is one of whatsapp, sms, x, copy, other.',
      'offer_id and session_id are 1 to 200 characters.',
      'An offer that is not delivering now is 409 not_delivering.',
    ],
  },
  {
    id: 'events',
    title: 'Events in',
    purpose: 'Phoenix posts what happened on its side: Impression, Open, Claim, Share.',
    method: 'POST',
    path: '/api/v1/events',
    headers: [AUTH, 'Content-Type: application/json', 'Idempotency-Key: <unique per batch>'],
    body: {
      channel: 'phoenix',
      events: [
        {
          type: 'impression',
          offer_id: 'clx9offer777',
          placement: 'card',
          country: 'KE',
          session_id: 'sess_8f2a',
          ts: '2026-11-13T09:01:12Z',
        },
        { type: 'share', offer_id: 'clx9offer777', session_id: 'sess_8f2a', link_code: 'Qm4Zt81c', ts: '2026-11-13T09:02:40+03:00' },
      ],
    },
    status: 202,
    response: { accepted: 2, deduped: 0, ignored: 0 },
    rules: [
      'type is impression, open, claim or share. ts is ISO 8601 with Z or an offset.',
      'A batch holds at most 500 events. More is 400 too_many_events.',
      'channel must match the key\'s channel, or 400 channel_mismatch.',
      'Idempotency-Key is required. Replaying a key returns the same counts and records nothing twice.',
      'Events dedupe per session, offer, type and hour; repeats count as deduped.',
      'Events whose offer_id is unknown are counted in ignored and not stored.',
      'ids (offer_id, session_id, link_code) are 1 to 200 characters.',
    ],
  },
  {
    id: 'stats',
    title: 'Link stats',
    purpose: 'What one share link has earned so far. Only your own channel\'s links.',
    method: 'GET',
    path: '/api/v1/links/Qm4Zt81c/stats',
    headers: [AUTH],
    status: 200,
    response: { opens_unique: 14, opens_all: 21, details_left: 5, claims: 3, children: 2 },
    rules: ['A code that is unknown, or belongs to another channel, is 404 unknown_link.'],
  },
]

export const ERRORS: [number, string, string][] = [
  [401, 'unauthorized', 'No bearer key, a wrong key, or the channel is not live.'],
  [400, 'bad_country', 'country is missing or not a supported market.'],
  [400, 'bad_request', 'The body or a field fails validation.'],
  [400, 'missing_idempotency_key', 'POST /events without an Idempotency-Key header.'],
  [400, 'too_many_events', 'More than 500 events in one batch.'],
  [400, 'channel_mismatch', 'Body channel is not the key\'s channel.'],
  [404, 'unknown_offer', 'No such offer.'],
  [404, 'unknown_link', 'No such link for this channel.'],
  [409, 'not_delivering', 'The offer is not delivering now.'],
  [500, 'server_error', 'Something failed on our side. Retry with the same Idempotency-Key.'],
]
