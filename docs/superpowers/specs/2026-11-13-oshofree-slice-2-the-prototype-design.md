# OshoFree — Slice 2 design: the prototype, built for real

Date: 13 November 2026. Status: approved by the user in one sentence ("Build everything
exactly the way it is. The flows, everything. I want Global to control everything.") and
written up here so a builder can plan from it without going back to the user.

## 1. Intent

Slice 1 proved the loop (sign-up → approval → campaign → Phoenix API → share link → landing
page → report). The user judged it "too basic" against the product they had already
designed: the OfferGrid v4 clickable prototype. Slice 2 rebuilds OshoFree so that every
screen, flow, piece of copy and visual detail of that prototype exists for real, backed by
the database, with Global as the account that controls everything on the platform.

Two sources are binding, in this order:

1. The prototype itself: `docs/superpowers/specs/prototype/offergrid-v4.html` (open it in a
   browser; copy its CSS and copy verbatim).
2. The two inventories written from it, which a builder reads instead of reverse-engineering
   the prototype:
   - `docs/superpowers/specs/prototype/advertiser-inventory.md` (16 screens, object model,
     9 flows, 31 components, 29 open questions; screenshots in `shots-advertiser/`)
   - `docs/superpowers/specs/prototype/global-and-design-inventory.md` (6 Platform screens,
     the shell, the phone preview, "Simulate a day", the design system with every token and
     component, 14 defects, 15 open questions; screenshots in `shots-global/`)

The PRD (`~/Downloads/OfferGrid_PRD_v0.2.docx`, not in the repo) is background only. Where
the PRD and the prototype disagree, the prototype wins, because the prototype is what the
user approved.

This document does not repeat the inventories. It decides what they leave open, says what
changes when a demo becomes a product, and maps it onto the existing codebase.

## 2. Goals

- Every screen in both inventories exists at a real URL, looks like the prototype (same
  tokens, type, spacing, components, copy) and does what the prototype does, persisted.
- Global is real: a platform role outside any workspace, with the Platform console, able to
  enter any workspace and act there with Owner powers, with every action recorded.
- Advertiser roles (Owner, Manager, Viewer) are enforced server-side exactly as the People
  page's "What each role can do" table says.
- Money works as the prototype models it: post-paid credit against monthly invoices,
  delivery and reward charges on a statement, credit in use, auto-pause at the limit,
  credit released when Global marks an invoice paid.
- Numbers come from events, not random seeds: impressions, opens, claims from Phoenix
  events; shares, friend opens, friend claims and rewards from OshoFree's own share chain.
  "Simulate a day" survives as a Global-only demo control that pushes synthetic events
  through the same pipeline, so demo numbers and real numbers never disagree.
- None of the prototype's 14 defects or 29 open questions is copied; each has a ruling in
  section 6.

## 3. Non-goals

- Real email, SMS or WhatsApp sending. Notifications are in-app; the bell and the
  Notifications page are the whole system. Toast copy that says "advertiser emailed" is
  kept as written.
- Real payments. There is no card, M-Pesa or top-up. Invoices are paid by bank transfer and
  Global marks them paid.
- Real airtime. Reloadly is modelled (aggregator balance, payouts, top-ups) but nothing is
  sent.
- Boomplay. It stays "coming soon" everywhere, as in the prototype.
- OTP on the consumer side, points redemption, the loyalty layer, webhooks to Phoenix, PDF
  generation (the "PDF" button opens a print-styled invoice page instead).
- Dark mode. The prototype is light only.

## 4. Anti-goals

- A screen that exists in the inventories but not in the product, or a control that does
  nothing. The prototype's no-op buttons (PDF, role change, Workspace Save, "+ Add client
  brand", Caps Save, "▦ Workspaces") all do something real here.
- Numbers that are made up at render time. If a number is on a screen it is computed from
  rows.
- A second colour source. The prototype's tokens are the only palette.
- Native `prompt()` / `confirm()`. Every dialog is a styled modal.
- Trusting the client for permissions. Every server action and route checks the role.

## 5. Constraints

- Same stack as slice 1: Next.js 15 App Router, TypeScript, Postgres 16 + Prisma 6,
  Auth.js v5 credentials, Vitest (DB-backed against `oshofree_test`), Playwright.
- The product is OshoFree. Every "OfferGrid" in the prototype becomes "OshoFree"; the logo
  tile reads "OF" (not "OG"); "OfferGrid points" becomes "OshoFree points".
- The prototype's CSS is ported, not reinterpreted. Section 6.5 of the Global inventory
  lists every component class; those classes become the console stylesheet.
- Tests never touch the development database (slice-1 rule). Implementers never start or
  stop the port-3100 server.
- Copy is verbatim from the inventories unless this document changes it. Where the
  prototype shows a value the product must compute, the formula in the inventory is the
  specification.
- The consumer landing page budget from slice 1 (≤ 60 KB, no client JavaScript) still
  holds.

## 6. Decisions

Each decision is Claude's call unless marked "(user)". The user said "Global controls
everything" and "build exactly like this"; everything else was decided here.

### 6.1 Who Global is, and what it controls (user)

- A `User.isGlobalAdmin` user is Global. Global is not a member of any workspace.
- Signing in as Global lands on Platform › Review. The sidebar shows only the PLATFORM group.
  The switcher lists every workspace on the platform (approved, pending and declined), then
  "Platform (Global)". The banner reads "Platform — you are acting as Global. Approvals,
  rates and settlements here affect every advertiser."
- Global enters a workspace from the switcher, from Advertisers › "Open workspace", or from
  a Review › "Live now" card (which opens the campaign inside its own workspace, fixing D1).
  Inside, Global has every Owner power. The banner becomes "Platform — you are acting as
  Global inside {workspace}." with a "Back to Platform" link; the avatar stays "GL"; the bell
  shows Global's notifications, not the workspace's. Inside a workspace the sidebar is that
  workspace's own (the owner's decision of 17 Nov supersedes the prototype's "advertiser nav
  plus PLATFORM"): the banner's "Back to Platform" and the switcher lead back to Platform.
- Advertisers never see the PLATFORM group or any Platform page (`requireAdmin()` on every
  Platform page and action, as in slice 1).
- Every Global action writes an `AuditEvent` (who, what, target, before/after, when):
  approve/reject campaign, approve/decline workspace, credit limit, rate, FX, share, top-up,
  mark paid, close month, enter workspace, "Simulate a day". Advertisers › workspace detail
  shows the audit trail for that workspace.
- Global also owns: marking invoices paid, closing the month (issuing invoices), the Phoenix
  channel key, and the demo controls.

### 6.2 Workspaces, membership, roles

- Workspace fields grow to: `name, type (Brand|Agency), country (billing), currency
  (derived from country), creditLimitUsd (default 500), status (pending|approved|declined),
  declineReason, registrationNumber, accountManager (text, default "Obinna A."),
  termsDays (14), approvedAt`. "Since" on the Workspace page is `createdAt`'s month.
- `WorkspaceMember.role` is `Owner | Manager | Viewer`. Permissions, enforced on every
  server action and page:

  | Capability | Owner | Manager | Viewer | Global |
  |---|---|---|---|---|
  | See campaigns, reports, Sharing, Rewards | yes | yes | yes | yes |
  | Create, submit, edit offer, resubmit, change without review, pause, resume, end | yes | yes | no | yes |
  | Change rewards per campaign and caps | yes | yes | no | yes |
  | See Billing & credit and Invoices | yes | yes | yes | yes |
  | Request a higher limit | yes | no | no | yes |
  | People: invite, change role, remove | yes | no | no | yes |
  | Workspace settings, Notifications settings | yes | no | no | yes |

  A Viewer sees the pages with the mutating controls hidden and the actions refused
  server-side. The last Owner cannot be demoted or removed.
- Invites: an `Invitation {email, role, token, invitedBy, expiresAt (7 days), acceptedAt}`.
  "Send invite" adds a Members row in a pending state ("Invited · Manager", with "Copy
  invite link" and "Revoke"), toast "Invite sent". The invite link is `/invite/<token>`;
  accepting creates the account if needed and adds the membership. There is no email.
- A user who belongs to several workspaces picks the active one in the switcher; the
  choice is a cookie (`of_ws`), validated against membership on every request. The
  "▦ Workspaces" button opens the same switcher as a popover (name, type · country, status
  pill); the native `<select>` is gone.
- Agency (open question 7): an agency is one workspace; `Campaign.brand` is free text with
  the "— client" hint; billing, invoices, people and credit are shared, in the agency's
  billing currency; each campaign's reward is in its market currency. The Workspace page's
  "Client workspaces" box lists the agency's client brands (distinct `brand` values with
  campaign counts) and "+ Add client brand" opens New campaign with the brand field focused.
- Declined workspace (D4, open question 13): status pill "Declined" (red); the owner gets
  the notification "Your workspace was declined" / "{reason}"; its campaigns cannot be
  approved (Approve disabled, warning "Workspace declined — campaigns can't go live."); the
  slice-1 declined banner stays. Global can re-approve from Advertisers.

### 6.3 Campaigns

- Fields, on top of slice 1: `placement (card|featured|video|splash)`, `creativeKey` (image
  or video), `ageGated`, `startsAt`, `endsAt`, `runsForDays (7|14|30|custom)`, `budgetUsd`,
  `rewardLocal` (integer, market currency units), `rewardCapPct (20)`, `cpmUsd` (snapshot
  taken at submission from the rate card), `fxPerUsd` (snapshot of the market FX at
  submission), `status`, `rejectReasonCode`, `rejectNote`, `version`.
- Status set: `draft | review | scheduled | live | paused | rejected | ended`. Transitions
  exactly as the advertiser inventory's state machine, with these rulings:
  - Edit offer on a **live** campaign (open question 10): the live version keeps running;
    the edit is saved as a pending revision (`CampaignRevision`) that goes to review;
    approval swaps it in. On the campaign page the status line reads "Live · a revised offer
    is in review". On a non-live campaign, edit and resubmit works as the prototype does.
  - End campaign now: styled confirm modal with the prototype's copy.
  - Pause/Resume/End are also available to Global from the review's "Live now" cards via the
    campaign page.
- New campaign is one form (open question 2), as the prototype, with every field, hint,
  default and validation rule from the inventory. Additions: a draft autosaves to
  `localStorage` per workspace and is cleared on submit, cancel or workspace switch (open
  question 20); start date cannot be in the past and end must be after start (open question
  24); "Runs for" gains "Custom" when the flight is not 7/14/30 days.
- Creative upload is real (slice-1 upload route): images (square or landscape, ≤ 2 MB);
  video MP4 ≤ 2 MB with the 6–15 s duration checked client-side; splash portrait image or
  MP4 ≤ 2 MB. The drop zone copy is the prototype's.
- Cost box, card preview and the 18+ rule are the inventory's formulas, using the current
  rate card and expected open rates.
- Credit rules at submit, edit and resume are the inventory's, computed from rows.

### 6.4 Review (Global)

- The queue is the inventory's: KPI strip, "New advertisers", "Campaigns waiting" with the
  checklist sub-line, cover, metadata chips, warnings, Approve/Reject/Preview, "Live now".
- Reject opens a styled modal (D3): a reason code (Misleading or unclear terms · Not
  available in market · Broken or unsafe link · Prohibited category · Missing licence or
  approval number · Creative standards) plus a note prefilled with "Terms unclear — say where
  the offer can be redeemed." The advertiser sees "{code}: {note}". Every decision is a
  `ReviewAction` (exists from slice 1) and the campaign page's Layer "History" lists them.
- The queue shows the slice-1 link check result for link offers ("Link works ✓ (200)" /
  "Link failed ✗ (404)").
- Badges and bell counts update after every action (D2).
- Approve is disabled while the workspace is pending or declined.

### 6.5 Money

- `LedgerEntry {workspaceId, at, description, amountUsd (− charge, + payment), kind
  (delivery|reward|payment|credit|refund), campaignId?, invoiceId?}` is the statement.
- `Invoice {workspaceId, number INV-XXXX (global sequence from 0052), period (first day of
  month), amountUsd, amountLocal, fxPerUsd (fixed for the month), status
  (open|due|overdue|paid), dueAt (issuedAt + 14 days), issuedAt, paidAt}`.
  - The current month is an `open` "(to date)" invoice whose amount is the running unbilled
    total, computed, not stored.
  - "Close month" (Platform › Advertisers header, Global only, also runs automatically on the
    1st via the daily job) issues the previous month's invoice for every workspace with
    charges: status `due`, due in 14 days. `overdue` is derived from `dueAt < now`.
  - "Mark paid" moves from the advertiser's Invoices page to Global (Advertisers › workspace
    detail › Invoices, and Platform › Advertisers row). The advertiser's Invoices page shows
    "PDF" (opens `/app/invoices/[id]/print`, a print-styled page) and the status.
- Credit in use, available, unbilled: the inventory's formulas. "Unbilled this month" is the
  sum of charges since the last issued invoice (open question 15), and the Statement box
  shows this month with a month selector for earlier months.
- Credit limit edits (Advertisers) validate `≥ 0`, re-render the row, notify the owner and
  write an audit event (D9, D10). "Request a higher limit" creates a `CreditRequest` that
  Global sees on Advertisers (open question 4) with Approve (sets the limit) / Dismiss.
- Auto-pause: the daily job pauses live campaigns of a workspace whose credit in use exceeds
  its limit (notification copy from the inventory). Resume is refused while over the limit.
  Lowering a limit below current use pauses on the next job run, as the prototype (open
  question 14); the Billing alert appears immediately.

### 6.6 Rates, FX, settlement

- `RateCard {channelId, country, placement, cpmUsd, effectiveFrom}`; the current rate is the
  latest row with `effectiveFrom ≤ now`. Editing a cell inserts a new row effective now
  (D7, open question 7 of the Global inventory). Campaigns snapshot `cpmUsd` at submission
  and keep it.
- `MarketFx {country, fxPerUsd, effectiveFrom}`; the Rates page's "Local FX" column becomes
  editable by Global. Invoices snapshot the FX on issue; the Billing page quotes the current
  month's rate.
- `ChannelShare {channelId, share (0..1), effectiveFrom}`; the Settlement page's share edit
  validates 0–1 and applies from the next statement (D9).
- `SettlementStatement {channelId, period, amountUsd, status (open|paid), paidAt}` is
  generated by "Close month" from the month's delivery charges × the share effective in
  that month. Past statements list from rows; "Mark paid" is Global's. "This month" figures
  filter by month (D8).

### 6.7 Delivery, events, rewards

- Phoenix events (slice-1 `POST /api/v1/events`) gain types `share`, `share_open`,
  `share_claim` and an optional `placement`; `POST /api/v1/claims` issues claim codes
  (`PHX-XXXX`, one per session per offer per day). `GET /offers` returns the prototype's
  wire shape (placement, creative image/video/color, cta, flags, share, ends_at).
- The share chain stays OshoFree's (slice 1): `POST /share` mints the link; the landing
  page records friend opens and claims. A **successful share** = a `share_claim` on a link
  with a known sharer. It creates `RewardPayout {campaignId, shareLinkId, sharerConsumerId,
  amountLocal, amountUsd, status (queued|sent|held|blocked), reason, createdAt, sentAt}` and
  10 points on `PointsLedger`.
- Fraud rules (the Rewards ledger's three rows become real and toggleable by Global):
  same device as the sharer → `blocked`; more than 5 successful shares per sharer per day →
  `held`; the friend's phone (from the landing page details) reused across 3+ sharers →
  `held`. Global reviews held payouts on the Rewards ledger (Release / Reject).
- Rewards cost comes out of the campaign budget as a ledger line "{campaign} — share
  rewards", capped at `rewardCapPct` of budget. `AggregatorAccount {balanceUsd}` and
  `AggregatorTopup {amountUsd, by, at}`; "sent" payouts decrement the balance.
- The daily job (`scripts/daily.ts`, runnable by cron and by Global's "Run daily job" on
  Review in non-production): posts delivery charges per campaign from the day's impressions
  × cpm / 1000 (ledger "{campaign} — delivery"), ends campaigns whose budget is spent or end
  date passed, starts scheduled campaigns whose start has arrived, pauses over-limit
  workspaces' campaigns, moves queued payouts to sent, and on the 1st closes the month.
- "Simulate a day" (open question 25): Global-only, shown only when `DEMO_CONTROLS=1`. It
  generates one day of synthetic Phoenix events and share-chain events for every live
  campaign using the inventory's generator (0.88 delivery factor, open-rate model, 33%
  claims, 9% shares, 2.2× friend opens, 30% friend claims, channel split 62/14/16/8), posts
  them through the real ingestion, then runs the daily job once. The toast is the
  prototype's. The date does not advance.

### 6.8 Reports and numbers

- Campaign page, home hero and cards, Sharing, Rewards, Billing: every number is the
  inventory's formula over `ChannelEvent`, `LinkEvent`, `RewardPayout` and `LedgerEntry`
  rows. "today" is the market's local day. Top sharers are the five sharers with the most
  friend claims, phones masked as `+234 80• ••• 4471` from the stored number.
- The campaign page gains nothing beyond the prototype except the rejection reason code and
  the "History" list of review decisions.
- Rejected campaign chart sub-line (D6, open question 17): "Not approved."
- Home filter pills gain "Scheduled" and "Rejected" only when such campaigns exist (open
  question 16); the filter resets on workspace switch.

### 6.9 Notifications and search

- `Notification {userId?, workspaceId?, title, detail, href, kind, createdAt, readAt}`.
  Workspace notifications go to every member whose prefs allow the kind; Global's go to
  Global users. The bell shows the unread count; opening the panel lists the latest 20;
  clicking an item marks it read and follows `href` (D11, open question 13). The
  Notifications page's toggles are stored per user per workspace and gate creation of
  `approved`, `credit`, `pace`, `ended`, `weekly` kinds. Weekly digest: created Monday 08:00
  market time by the daily job when enabled.
- Search / ⌘K (open question 1): a real palette. In a workspace it searches campaigns (name,
  headline, brand), invoices (number) and people (name, email); for Global it searches
  workspaces and every campaign. Results are grouped under those headings; Enter opens the
  first; Escape closes. The topbar field is a button that opens it; ⌘K / Ctrl+K opens it.

### 6.10 Phoenix preview and consumer surfaces

- The "On Phoenix" modal is the inventory's, with Escape-to-close and a focus trap (D12).
  Splash shows as a full-screen takeover inside the phone with a "Skip" chip; video shows a
  poster with a ▶ badge (open question 22, D13).
- The slice-1 landing page `/o/[code]` stays the consumer surface (the prototype has none).
  It gains the campaign's reward label ("Earn ₦50 airtime when a friend claims") and the
  18+ badge where flagged.

### 6.11 Shell, responsive, design system

- The shell is the inventory's: sidebar (logo tile, name, "{type} workspace · {country}",
  grouped nav with icons and counts, active orange), topbar (search button, bell, "▦
  Workspaces", avatar + switcher), banner, breadcrumb + h1 + lead + actions, toast. The
  footer "Demo · data resets on reload" is replaced by the app version.
- Below 980 px: the hamburger drawer from slice 1 (not the stacked sidebar, D14); tables and
  code blocks scroll horizontally inside their box; the campaign page's Sharing KPI grid
  wraps.
- The design system is ported as `src/styles/console.css`: the prototype's `:root` tokens
  and every component class from Global inventory section 6.5 (`.btn` variants, `.mc`,
  `.cc`, `.hero`, `.box`, `.st-*`, `.pill`, `.tagp`, `.warn`, `.kv`, `.est`, `.steps`,
  `.opt`, `.drop`, `.sw`, `.tog`, `.q`, `.notif`, `.modal`, `.phone`…). React components
  render those classes. `tokens.ts` keeps the same hex values and remains the only TS
  source of colour; the lint rule exempts `console.css`. Icons: the sidebar's Feather-style
  inline SVGs; the topbar's emoji become Lucide icons of the same size.
- Initials ignore punctuation and parenthesised suffixes (D5).

### 6.12 Routes

Workspace (`/app`, console route group): `/app` Campaigns home · `/app/campaigns/new` ·
`/app/campaigns/[id]` · `/app/campaigns/[id]/edit` · `/app/sharing` · `/app/rewards` ·
`/app/billing` · `/app/invoices` · `/app/invoices/[id]/print` · `/app/people` ·
`/app/workspace` · `/app/notifications` · `/invite/[token]`.

Platform (`/admin`): `/admin/review` · `/admin/advertisers` · `/admin/advertisers/[id]`
(detail: facts, campaigns, invoices with Mark paid, credit requests, audit trail) ·
`/admin/rates` · `/admin/settlement` · `/admin/rewards` · `/admin/api`.

Channel API: `/api/v1/offers`, `/share`, `/events`, `/claims`, `/links/[code]/stats`.

### 6.13 Seed

The seed recreates the prototype's world deterministically: the four workspaces (Kola
Bright NG brand $1,500; MediaSpec (agency) NG $8,000; Pesa Link KE $500; SunFresh Juices GH
$500 pending), their people (Tunde Okafor + Ada Eze; Dolapo Adeyemi + Chidi Nwosu + Kemi
Balogun; Wanjiru Kamau; Kofi Mensah), the nine campaigns with the inventory's descriptions,
placements, budgets, rewards, flights and statuses, the rate card, FX, share 0.55,
aggregator $1,240, the invoices (INV-0037…INV-0051 with the inventory's statuses), ledger
lines, and notifications. Metrics come from generated events for each campaign at its
progress (the inventory's seed generator, seeded RNG). Fixes: Jackpot 10 moves to market SN
with a Senegal description note; no overspend; sharers' phones match the market; ended
campaigns have no "today" impressions. Logins (password `password`): `admin@oshofree.demo`
(Global), `tunde@kolabright.demo`, `dolapo@mediaspec.demo`, `wanjiru@pesalink.demo`,
`kofi@sunfresh.demo`, plus `ada@kolabright.demo` (Manager) and `kemi@mediaspec.demo`
(Viewer) for role checks.

### 6.14 Rulings from the builder check (13 Nov 2026)

A reviewer read this document as a builder would and asked seven questions. All seven are
settled here as Claude's calls:

1. **Sharer identity and phone.** `POST /api/v1/share` gains an optional `msisdn` (E.164,
   verified by Phoenix's own OTP before the call). When present, OshoFree upserts a
   `Consumer` for it and sets `ShareLink.consumerId` on the Channel link, so a Phoenix sharer
   and a landing-page sharer are the same kind of record. A payout for a sharer with no known
   phone is `held` with reason `no_phone` until Global releases it or Phoenix resends the
   share with a number. "Top sharers" shows masked phones; a sharer without one shows as
   "Phoenix user · ••{last 4 of session}". The simulation and the seed always supply numbers.
2. **One source for friend opens and claims.** The share link always lands on OshoFree's
   `/o/<code>`, so a friend's open and claim are the landing page's `LinkEvent` rows and
   nothing else. Phoenix's `share_open` / `share_claim` events are accepted and stored for
   the channel's own stats page but are never counted in advertiser metrics or payouts. A
   successful share is the first `Claim` `LinkEvent` per link per visitor; its id is the
   payout's `claimEventKey`. "Same device" compares the friend's visitor cookie with the
   sharer's visitor cookie (when the sharer ever opened the landing page) or, for Phoenix
   sharers, the friend's claim session with the sharer's `session_id`.
3. **Pending revision.** A `CampaignRevision` holds only the offer fields (brand, category,
   headline, description, tile colour, creative keys, placement, redeem method, claim code,
   link, age gate). Money and timing never go through it; they use "Change without review"
   and apply to the live campaign at once, so credit in use is unchanged by a revision. A
   revision is a row in the review queue ("Revised offer · {headline}", same actions) and
   counts in the Review badge. Rejecting it leaves the campaign live with the status line
   "Live · revised offer not approved: {code}: {note}" and the advertiser can edit again.
   Scheduled and paused campaigns behave like live ones; draft, review, rejected and ended
   campaigns are edited in place and go to review as the prototype does.
4. **Rewards caps.** The three workspace caps are the advertiser's own limits for every
   campaign in the workspace: max successful shares per sharer per day (over it → payout
   `held`, reason `cap_per_sharer`), max rewards as % of budget (the default and ceiling for
   each campaign's `rewardCapPct`), points per successful share (used when awarding points).
   Global's fraud rule "more than 5 rewards per sharer per day" is the platform floor: the
   effective per-sharer limit is the lower of the two while the rule is enabled.
5. **Seed money.** Every money figure in the seed is derived from the seeded events and
   ledger lines; the prototype's invoice and settlement dollar amounts are not targets (the
   inventories flag them as inconsistent). Seed dates are relative to the run day, as in the
   prototype, so the demo always looks current.
6. **Workspace settings after approval.** Name and registration number change freely. Type
   and billing country are editable while the workspace is pending; after approval they are
   read-only for the Owner with the hint "Ask Global to change this." and editable by Global
   on the advertiser detail page. A billing-country change takes effect at the next invoice.
7. **Channel keys.** The Phoenix API page gains a "Keys" box for Global: the live key's
   prefix and creation date, "Rotate key" (shows the new key once; the old key stays valid
   for 24 hours), and the sandbox note. Advertisers never see this page.

## 7. Left to the builder

- Component file boundaries, as long as each prototype component class maps to one React
  component.
- The `localStorage` draft format; the palette's search implementation (SQL `ILIKE` is
  fine).
- Invoice number sequencing mechanics; the print page's layout beyond "header, lines,
  totals, bank details, pay-by date".
- Masking format for non-Nigerian numbers beyond "country code, first two digits, dots, last
  three or four".
- Test data factories.

## 8. Open questions for later slices (not blocking)

- Real email delivery and the N-xx templates from the PRD.
- Reloadly and payment-provider integrations.
- Phoenix webhooks; Boomplay onboarding; a second channel's rate card.
- Consumer OTP and points redemption.
- Agency parent/child workspaces, if the one-workspace model proves wrong.

## 9. Calls the user may want to check

1. Product name OshoFree everywhere; logo "OF".
2. Global enters a workspace with Owner powers and a visible banner; every Global action is
   audited.
3. "Mark paid" and "Close month" are Global's, not the advertiser's.
4. Edit offer on a live campaign creates a pending revision; the live version keeps running.
5. Invites are links to copy (no email); pending members show as "Invited".
6. "Simulate a day" and "Run daily job" exist only with `DEMO_CONTROLS=1` and only for Global.
7. Fraud rules are enforced (blocked / held) and Global releases held rewards.
8. Rates and FX have effective dates; campaigns keep the CPM they were submitted at.
9. The mobile layout uses a drawer, not the prototype's stacked sidebar.
10. The consumer landing page from slice 1 remains the share destination.
