# OshoFree — Slice 1 design: the loop you can show

Date: 2026-11-12 · Status: revised after the builder check, awaiting approval · Written by Claude with Jide Olatunji

## 1. Intent

OshoFree is an ad aggregator for brands and agencies in African markets. A brand
creates an offer once in OshoFree; OshoFree places it on channels where consumers
see it. Phoenix Browser is the first channel.

What makes OshoFree different from an ad network is provable shareability. Every
offer carries a share link that OshoFree mints and owns. When a consumer shares it
and a friend opens it, the friend lands on an OshoFree page, OshoFree counts the
open, and the brand sees the chain of who brought whom. A channel renders the card
and hands out the link; OshoFree does the counting. The brand's report never
depends on trusting the channel's numbers.

Slice 1 is the smallest version that lets one brand run one real offer on Phoenix
and watch it spread, and that can be demoed before Phoenix has integrated. Later
slices add money (billing, credit, invoices), rewards (OTP, airtime payout, fraud
rules), more placements and more channels. The product is elaborated
progressively: this document decides slice 1 only, and records what later slices
must not be blocked by.

The prototype "OfferGrid v4" (claude.ai/artifact/PSsdYiMEzEfwVQBk1K6mk7) is the
base experience to build on. Its sidebar, campaign form, Phoenix preview and API
shape are the starting point, not a spec to copy line by line.

## 2. Goals

1. A brand manager signs up with a work email, creates a workspace, and Global
   (the platform operator) approves it.
2. The manager creates a wall-card campaign in one form, sees a live preview,
   submits it; Global approves; it goes live; the manager can pause and resume.
3. Phoenix fetches live offers through a documented channel API. A built-in demo
   wall renders the same offers so the loop can be shown without Phoenix.
4. A consumer who opens a share link lands on an OshoFree page, sees the offer,
   can claim it, leaves their details, and gets their own link to share on.
5. The manager sees a campaign report: funnel and daily series, by channel, from
   events OshoFree counted itself.
6. Everything runs locally with one Postgres, seeded so the demo works from the
   first `npm run dev`.

## 3. Non-goals for slice 1

- Money. Budgets are recorded but nothing is charged: no credit limit, invoices,
  statements, rate card, settlement, or cost estimate.
- Rewards. No OTP, airtime, points, or fraud rules. The reward is text on the card
  ("Share with 10 friends, get ₦50 airtime").
- Placements other than the wall card. No video or splash.
- Channels other than Phoenix. Boomplay is a row in a table, nothing more.
- Roles beyond Owner. No invites. No agency client workspaces.
- Campaign versions (story C7) and change-without-review (C6).
- Outbound email of any kind. Notifications are in-app only; sign-up has no email
  verification.
- Search, dark mode, CSV export, weekly digest.

## 4. Anti-goals

- A consumer page that is slow on a cheap Android phone on mobile data. The
  landing page is the product's public face; it must be small and
  server-rendered.
- Trusting channel-reported numbers for what happened on OshoFree's own pages.
  Channel events and OshoFree events are separate columns in every report.
- Solving money or rewards "a bit". Partial billing is worse than none.
- A monolith component. Pages are composed from small components from the start.
- Generated prose in the UI. The console states facts, one line per item, in the
  consequence-first voice: what it means for the business, then the number.

## 5. Constraints

- One builder working with Claude Code. Demo-first: the first client demo is the
  loop described in section 2.
- Nigeria first for copy, currency symbol and seed data. The model carries a
  country everywhere so Kenya, Ghana, Tanzania and Senegal are a seed, not a
  migration.
- Runs from a fresh clone with Docker Postgres and `npm run dev`. No third-party
  accounts are required for slice 1.
- Slice 2 (money) and slice 3 (rewards) must be additive. Nothing in slice 1's
  model should need renaming to add them.

## 6. Decisions

### 6.1 Stack (Claude's call)

- Next.js 15 (App Router), TypeScript. Server components wherever a page reads
  data; client components only for forms, the live preview and charts.
- Tailwind CSS and shadcn/ui (Radix primitives) for the two consoles. The consumer
  landing page uses plain Tailwind, no component library, and no client
  JavaScript beyond the details form.
- Postgres 16 in Docker locally; Prisma ORM.
- Auth.js v5 with the Credentials provider (email + password, bcrypt) and a JWT
  session cookie. A magic-link provider replaces it when an email provider
  arrives in a later slice.
- No background jobs in slice 1; report numbers are SQL aggregates computed on
  read. When jobs are needed, pg-boss (Postgres-backed), not Redis.
- Tests: Vitest for units and API routes; Playwright for the loop end to end.
- Deploy target when wanted: Vercel plus hosted Postgres (Neon). Object storage:
  an S3-compatible bucket (Cloudflare R2). Neither is set up in slice 1; the
  storage interface is.
- One app, one `package.json`. Not a monorepo.

Why not NestJS with a separate API, as in Verism: one builder, one deployable,
and the public landing page benefits from Next rendering it on the server. The
channel API is Next route handlers under `/api/v1`.

### 6.2 Surfaces (five, in one app)

| Surface | Path | Who | Auth |
|---|---|---|---|
| Advertiser console | `/app/...` | Workspace owner | Session, workspace-scoped |
| Global console | `/admin/...` | Platform operator | Session, `isGlobalAdmin` |
| Consumer landing | `/o/[code]` | Anyone with a share link | None |
| Channel API | `/api/v1/...` | Phoenix and the demo wall | Bearer channel key |
| Demo wall | `/wall` | Demos and tests | Env flag `DEMO_WALL=1` |

Sign-up and sign-in live at `/sign-up` and `/sign-in`. A signed-in user with no
workspace is sent to `/app/new-workspace`.

### 6.3 Information architecture

Advertiser sidebar, from the prototype, trimmed to slice 1:

- Campaigns: Campaigns (home), New campaign
- Growth: Sharing
- Organisation: Workspace

Money and People groups arrive with later slices. Under the nav sits a
"Set up OshoFree" checklist card (as Whisper Flow does): Create workspace →
Add your first campaign → Preview it on Phoenix → Share your first link. Each
item ticks when the corresponding fact is true in the data, never by hand.

Global console: Review (queue), Advertisers (list), Phoenix API (docs).

### 6.4 Campaign form (story C2, trimmed)

Fields: name; brand (free text, prefilled with the workspace name); country (NG,
KE, GH, TZ, SN); category (the prototype's seven); headline ≤ 48 chars;
description ≤ 240 chars; creative image (jpg/png/webp, ≤ 2 MB) or a tile colour
from seven swatches when there is no image; placement (Wall card; the other three
shown disabled with "coming soon"); redeem method: claim code (text) or link
(https only); budget in USD (≥ 50, recorded only); start date; runs for (days);
share reward label (free text ≤ 60, e.g. "Share with 10 friends, get ₦50
airtime"); a checkbox "This offer is genuine and lawful in [country]".

Validation is inline and submit stays disabled until valid. Rules are the
prototype's, minus the credit check: betting category, or a headline mentioning a
draw or jackpot, requires a licence or approval reference in the description;
link offers need an https URL.

Right rail: the card exactly as the Phoenix wall will show it, updated on every
change. "Preview on Phoenix" opens the phone-frame modal with this card outlined
among the offers currently delivering in that country, from the same query the
channel API uses.

### 6.5 Status machine

Workspace: pending → approved | declined (Global; declining needs a reason).

Campaign: draft → review → live | scheduled | rejected (Global; rejecting needs a
reason). scheduled → live when the start date arrives. live ⇄ paused (owner).
live | paused → ended when the end date passes. rejected → review when the owner
edits and resubmits.

"scheduled → live" and "→ ended" are computed on read from dates, not by a job.
One predicate, `isDelivering(now)` = status in (live) and startsAt ≤ now < endsAt
and workspace approved, is used by the channel API, the demo wall, the preview
and the home hero, so all four always agree.

### 6.6 Data model (Prisma)

- User: id, email (unique), passwordHash, name, isGlobalAdmin, createdAt.
- Workspace: id, name, type (Brand | Agency), country, status (pending |
  approved | declined), declineReason?, createdAt.
- WorkspaceMember: userId, workspaceId, role (Owner | Manager | Viewer). Only
  Owner is created in slice 1; the enum exists so slice 2 adds no migration.
- Channel: id, key (unique, e.g. "phoenix"), name, apiKeyHash, isLive,
  countries[]. Seeded: phoenix (live), boomplay (not live).
- Campaign: id, workspaceId, name, brand, country, category, headline,
  description, creativeImageKey?, tileColor?, placement, redeemMethod,
  claimCode?, linkUrl?, budgetUsd, startsAt, endsAt, shareRewardLabel, status,
  rejectReason?, submittedAt?, decidedAt?, createdAt, updatedAt.
- ReviewAction: id, targetType (Workspace | Campaign), targetId, action
  (Approve | Reject | Decline), reason?, byUserId, at.
- ShareLink: id, code (unique, 8 chars, Crockford base32 so there is no 0/O or
  1/I confusion), campaignId, channelId, parentId?, depth, sharerType (Root |
  Channel | Consumer), sharerSessionId?, consumerId?, via? (whatsapp | sms | x |
  copy | other), createdAt. Exactly one Root link per (campaign, channel), minted
  on approval; it is the offer's canonical landing and the CTA's click-through
  target, and it is never handed out as a share link, so an open on a Root link
  is a "direct" open, not a friend open. Channel links (depth 1) are minted by
  POST /v1/share with the medium in `via`. Consumer links (depth ≥ 2) are minted
  by the landing page's details form; their `via` is set when the consumer taps
  one of the share buttons (see 6.8).
- Consumer: id, phone (E.164, unique), country, name?, createdAt. Not verified
  in slice 1.
- LinkEvent: id, linkId, type (Open | Claim | DetailsLeft), visitorId (cookie),
  ipHash, userAgent, deduped (bool), at. Open is deduped per (link, visitor, day)
  on write; the raw row is kept and flagged, so reports can show both unique and
  all opens.
- ChannelEvent: id, channelId, campaignId, type (Impression | Open | Claim |
  Share), sessionId, linkCode?, at, idempotencyKey (unique per channel). Posted
  by Phoenix. Deduped on (channel, session, campaign, type, hour).

Reports are SQL aggregates over LinkEvent and ChannelEvent grouped by campaign,
channel and day. No materialised table in slice 1.

### 6.7 Channel API v1 (the Phoenix contract)

All under `/api/v1`, bearer channel key, JSON. Rate limiting and SLOs are later.

- GET /offers?country=NG → `{ country, generated_at, ttl_seconds: 900, offers }`.
  Only delivering campaigns (6.5), ordered by placement then start date. Each
  offer: id, placement, brand, headline, description, category,
  creative { image, color }, cta { label, type: code | link, url },
  share { enabled: true, reward_label }, ends_at.
  No share URL is returned here. Phoenix calls POST /share at the moment a user
  taps Share and puts the returned URL in the share sheet; that is what makes
  every friend open attributable to one sharer. The Root link is used only as
  `cta.url` for link offers: `https://<host>/o/<code>?go=claim` logs a Claim
  (and no Open) then redirects to the brand's link, so the click-through is
  counted by OshoFree and Phoenix must not post a Claim for link offers. For
  code offers, cta.label is the code and Phoenix posts the Claim event when it
  shows it.
- POST /share `{ offer_id, session_id, via }` → `{ code, url }`. Mints a Channel
  ShareLink (depth 1) under the Root with that session as sharer and `via`
  stored. Phoenix puts `url` in its share sheet. Phoenix may also post a Share
  event; it is kept for reconciliation and never counted as a share.
- POST /events `{ channel, events: [...] }` with an `Idempotency-Key` header.
  Types Impression | Open | Claim | Share; batch ≤ 500; responds 202 with
  `{ accepted, deduped }`.
- GET /links/{code}/stats → `{ opens_unique, opens_all, details_left, claims,
  children }`, so Phoenix can see how often a link was opened.

The docs page at `/admin/api` renders these with the prototype's examples and,
in development, the seeded key the demo wall uses.

### 6.8 Consumer landing `/o/[code]`

Served by a route handler that renders React components to static markup, so the
page ships no client JavaScript at all: the Next runtime never loads here, forms
are native `<form method="post">`, and every action is a request to a sibling
route handler. The ≤ 60 KB transferred budget (excluding the image) is a hard
gate with a test behind it. One image, system font, no analytics scripts. Shows
brand, headline, description, image or colour tile, reward label, "Offer ends
<date>", and two actions:

- Claim. A code offer shows a "Show my code" button; submitting it logs a Claim
  and re-renders with the code revealed. A link offer's button logs a Claim and
  redirects to the brand's link. Either way "friend claimed" is a real event.
- Share and earn: an inline form, name (optional) and phone (required, Nigerian
  format first, stored as E.164). Submitting upserts the Consumer by phone, mints
  a Consumer ShareLink with this link as parent, and shows their link with
  WhatsApp, SMS, X and copy buttons. Each button is a redirect-through link
  (`/o/<code>/share?via=whatsapp`) that stores `via` on the new link and then
  forwards to the plain share URL (`wa.me`, `sms:`, the X intent URL). Copy
  shows the URL in a selectable field; no clipboard script.

An Open event is logged on render, deduped per visitor cookie per day; `?go=claim`
requests log only a Claim. An unknown or ended code shows "This offer has ended"
with the brand name, HTTP 410. Copy is English in slice 1; the model carries
country so language can follow.

### 6.9 Advertiser home (C8) and campaign report (C9, part of G5)

Home: hero = the first live campaign, else paused, else in review. Four numbers,
all flight to date: impressions (with today's count as a second line), unique
link opens, shares, claims. A pace line computed from days elapsed against the
flight. Other campaigns as cards; status filter pills.

Campaign page: the card, status and actions (Pause / Resume, Edit and resubmit
when rejected, Preview on Phoenix); a 14-day daily chart of impressions, link
opens and claims; the funnel saw → opened → claimed → shared → friend opened →
friend claimed, by channel; a Sharing section with shares, friend opens, friend
claims, details left, deepest chain, a breakdown by channel (Phoenix, Boomplay)
and a breakdown by medium (WhatsApp, SMS, X, copy). Viral coefficient = friend
claims ÷ shares (Claude's call; revisit in slice 3).

Growth › Sharing: the same measures aggregated across the workspace.

Where each number comes from. Channel facts and OshoFree facts are never summed
into one figure without saying so. In the UI, channel facts carry the channel's
name ("on Phoenix") and OshoFree facts carry "via link".

| Number | Source | Note |
|---|---|---|
| Saw (impressions) | ChannelEvent Impression | by campaign, channel, day |
| Opened on Phoenix | ChannelEvent Open | same |
| Claimed | ChannelEvent Claim (code offers, shown on Phoenix) plus LinkEvent Claim (any offer, on the landing page or via `?go=claim`) | two columns; the funnel step is their sum, which cannot double count because Phoenix never posts Claim for link offers |
| Shares | ShareLink rows with sharerType Channel or Consumer | ChannelEvent Share is reconciliation only |
| Direct link opens | LinkEvent Open, deduped, on depth-0 links | rare, since CTA click-throughs log no Open |
| Friend opened | LinkEvent Open, deduped, on depth ≥ 1 links | |
| Friend claimed | LinkEvent Claim on depth ≥ 1 links | |
| Details left | LinkEvent DetailsLeft | |
| Deepest chain | max(depth) over the campaign's links | |
| Viral coefficient | friend claimed ÷ shares | both OshoFree facts |
| 14-day chart | impressions (channel), unique link opens (all depths), claims (both sources, stacked) | per day, in the workspace country's timezone |

### 6.10 Global console

Review: pending workspaces (approve, or decline with reason) and campaigns in
review (approve, or reject with reason). Each campaign row shows the creative,
the checklist line from the prototype ("Real offer · lawful in market · terms
clear · link works · betting and draws carry a licence and show 18+"), the result
of a HEAD request to the link, and a preview button. A workspace must be
approved before its campaigns can be.

Advertisers: list with status, country, campaign count and "Open workspace",
which switches context with a visible banner. Phoenix API: the docs page.

### 6.11 Demo wall `/wall?country=NG`

A phone-shaped page that calls GET /offers with the seeded development key,
renders the cards the way Phoenix's "More → Offers" does, posts Impression on
render, Open on tap, Share by calling POST /share and showing the minted link,
and Claim on claim. Env-gated. Playwright drives it for the end-to-end test.

### 6.12 Design language

From the prototype: page background #F6F7F9, white cards with 1px #E6E8EE
borders and 14px radius, Phoenix orange #FF5A1F reserved for the primary action
and the active nav item, status pills (live green, review and paused amber,
rejected red, scheduled blue, ended grey), 28px page titles with a one-sentence
subtitle saying what the page is for.

From Whisper Flow: generous whitespace, a "Today"-style block at the top of
Home, tabs for lists, calm empty states with one line and one action, and the
set-up checklist card in the sidebar.

Colour and spacing tokens live in one file. No raw hex in components; a lint
rule enforces this from the first commit.

### 6.13 Repository layout

```
oshofree/
  docs/superpowers/specs/      design documents (this file)
  docs/superpowers/plans/      implementation plans
  prisma/                      schema.prisma, migrations/, seed.ts
  src/app/(auth)/              sign-in, sign-up
  src/app/app/                 advertiser console
  src/app/admin/               global console
  src/app/o/[code]/            consumer landing
  src/app/wall/                demo wall
  src/app/api/v1/              channel API
  src/components/              ui (shadcn), console, landing
  src/lib/                     auth, db, links, delivering, reports, storage, copy, tokens
  tests/unit, tests/e2e
  docker-compose.yml, .env.example, .github/workflows/ci.yml
```

CI from the first commit: type-check, lint and unit tests on every push;
Playwright on main.

### 6.14 Seed data

Global admin `admin@oshofree.demo`. Brand workspace "Kola Bright" (NG, approved)
with owner `tunde@kolabright.demo`. A pending workspace "Zuri Foods". Campaigns:
one live ("Buy 2 get 1", claim code), one in review, one scheduled, one ended.
The phoenix channel with a development key the seed prints. Fourteen days of
synthetic events and a share chain three deep, so the report and Sharing pages
have something to show. All dev passwords are `password`.

## 7. User stories covered

- Campaigns: C1 ✓ · C2 ✓ (card only, no cost estimate) · C3 preview ✓, estimate
  ✗ · C4 ✓ · C5 ✓ · C6 ✗ · C7 ✗ (rejected → edit → resubmit only) · C8 ✓ · C9 ✓
  minus CSV.
- Growth: G1 ✓ via API and demo wall · G2 ✗ (details without OTP) · G3 ✗ · G4 ✗
  (label only) · G5 partial (no rewards paid) · G6 ✗.
- Money: M1–M6 ✗.
- Organisation: O1 ✗ · O2 partial (name, type, country) · O3 ✗.
- Platform: P1 ✓ · P2–P4 ✗ · P5 basic · P6 ✓ (docs, sandbox = demo wall,
  idempotency; rate limits and SLOs ✗).

## 8. Left to the builder

- Short-code generation and collision handling; visitor cookie name and lifetime;
  how the IP-hash salt is managed.
- Dedupe implementation (unique index versus on-write check).
- Chart library (Recharts is fine) and the SQL for the daily series.
- Which shadcn components; form handling (react-hook-form with zod suggested).
- Image upload in development (local `./uploads` behind the storage interface)
  and the maximum dimensions rule.
- Playwright test structure and seed specifics beyond 6.14.
- A small set of lint rules beyond "no raw hex".

## 9. Calls made after the builder check (12 Nov 2026)

A reviewer read this document as the builder would and asked five questions.
All five were settled here as Claude's calls rather than sent back:

1. Every report number now has a named source and filter (6.9), and channel
   facts and OshoFree facts are never silently summed.
2. The 60 KB landing-page budget is a hard gate, met by rendering React to
   static markup from a route handler with no client runtime (6.8).
3. GET /offers no longer returns a share URL; Phoenix mints a per-sharer link
   with POST /share at share time, and the Root link serves only the CTA
   click-through, which logs a Claim and no Open (6.6, 6.7).
4. Code offers log a Claim on the landing page through a "Show my code" step,
   so "friend claimed" is real for the seeded campaign (6.8).
5. Sharing is broken down both by channel (Phoenix) and by medium (WhatsApp,
   SMS, X, copy); `via` is stored on ShareLink and set by redirect-through
   share buttons, keeping the landing page free of client JavaScript (6.6, 6.8).

## 10. Open questions for later slices (not blocking slice 1)

- Who verifies a sharer's phone when the sharer is inside Phoenix: OTP in Phoenix
  posting a hash, or an OshoFree page? Slice 3.
- Push instead of pull for a channel that cannot poll. Slice 4.
- Landing-page language per market.
