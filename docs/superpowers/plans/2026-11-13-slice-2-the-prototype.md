# OshoFree Slice 2 — The Prototype, Built for Real: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every screen, flow, piece of copy and visual detail of the OfferGrid v4 prototype exists in OshoFree for real, persisted, with Global controlling the platform.

**Architecture:** The prototype's CSS becomes a console stylesheet and its components become React components that emit those classes. Slice-1 data (events, share links, landing page, channel API) stays and is extended; new tables carry roles, invites, notifications, audit, money (ledger, invoices, credit), rates with effective dates, rewards payouts and settlement. A daily job turns events into charges and status changes; "Simulate a day" pushes synthetic events through the same path.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind v4 (+ the ported prototype CSS), Prisma 6 + Postgres 16, Auth.js v5, zod, react-hook-form, Vitest (DB-backed, `oshofree_test`), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-oshofree-slice-2-the-prototype-design.md`, which binds
`docs/superpowers/specs/prototype/advertiser-inventory.md` (ADV below) and
`docs/superpowers/specs/prototype/global-and-design-inventory.md` (GLB below) as the screen-level
specification. The prototype itself is `docs/superpowers/specs/prototype/offergrid-v4.html`.
Section references like "ADV §3" and "GLB §2.1" point into those two documents; the
implementer of a screen task reads its section in full before writing code.

## Global Constraints

- Product name OshoFree. Every "OfferGrid" in prototype copy becomes "OshoFree"; the logo tile is "OF"; "OfferGrid points" → "OshoFree points". Nothing else in the copy changes.
- Copy is verbatim from ADV/GLB, including `—`, `·`, `›`, `−` and currency symbols, and lives in `src/lib/copy*.ts`, never inline in JSX.
- Colours: `src/lib/tokens.ts` is the only TypeScript source of hex; `src/styles/console.css` is the only CSS source (lint exempts both). Values: GLB §6.1.
- Components emit the prototype's class names (GLB §6.5): `.btn .p/.d/.g/.s/.lg`, `.mc`, `.cc`, `.hero`, `.box`, `.st .st-*`, `.pill`, `.tagp`, `.warn`, `.kv`, `.est`, `.steps`, `.opt`, `.drop`, `.sw`, `.tog`, `.q`, `.notif`, `.modal`, `.phone`, `.fun`, `.hbar`, `.lead`, `.empty`, `.toast`, `.crumb`, `.head`, `.wrap`, `.two`.
- No native `prompt()`/`confirm()`/`alert()`. Dialogs are the `Modal` component (focus trap, Escape closes).
- Every server action and every page checks permission server-side with `requireMember(capability)` or `requireAdmin()`; a refused action throws `FORBIDDEN`.
- Money is stored in integer USD cents on new tables (`amountCents`), displayed with `usd()`. Existing `Campaign.budgetUsd` (whole dollars) stays.
- Markets: `NG KE GH TZ SN` with the currencies, symbols and time zones in `src/lib/markets.ts`; FX from `MarketFx` rows (seed: 1550, 129, 15.5, 2600, 610 per USD).
- Placements `card featured video splash`; labels "Wall card", "Featured tile", "Video", "Splash"; expected open rates 3.6 / 5.5 / 7.0 / 9.0 %.
- Tests: Vitest in `tests/unit/*.test.ts`, DB-backed, `resetDb` between tests, `npm test` must stay green; new pure logic gets unit tests; every server action gets a permission test. Never start or stop the port-3100 server; never touch the development database.
- Commit after each task; one task may be several commits.
- The consumer landing page stays ≤ 61,440 bytes with no client JavaScript.

## Review Focus

1. **Credit maths.** In use = outstanding invoices (due + overdue) + unbilled charges since the last issued invoice + Σ(budget − spend) over live/review/scheduled/paused campaigns; ended and rejected release. A wrong sum blocks or allows submissions wrongly. Pinned in Task 8.
2. **Rate snapshots.** Editing a rate inserts a new effective row; existing campaigns keep `cpmCents` and charge at it; the estimate uses the current rate. Pinned in Tasks 7 and 27.
3. **Permissions.** A Viewer cannot call any mutating action even with a crafted request; a Manager cannot touch people, settings or credit; Global can do everything inside a workspace; the last Owner cannot be demoted. Pinned in Tasks 4 and 13.
4. **Market time.** "today", day buckets, scheduled→live and campaign end use the campaign market's time zone; invoices use the workspace's. Pinned in Tasks 12 and 27.
5. **Idempotency.** Running the daily job twice for the same day, replaying a `share_claim`, or clicking "Simulate a day" twice must not double-charge or double-pay. Pinned in Tasks 26, 27 and 28.

---

### Task 1: Console stylesheet (the prototype's CSS, ported)

**Files:**
- Create: `src/styles/console.css`
- Modify: `src/app/layout.tsx` (import it after `globals.css`), `eslint.config.mjs` (exempt `src/styles/console.css` and keep `tokens.ts` exempt), `src/lib/tokens.ts` (add `purple '#6C5CE7'`, `purpleSoft '#EEEBFD'`, `bannerBg '#FFF7F3'`, `bannerText '#7A3412'`, `art '#0b0f1a'`, `phoneFrame '#101218'`, `phoneScreen '#F5F6F8'`, `chartPast '#DADDE4'`)
- Test: `tests/unit/console-css.test.ts`

**Interfaces:**
- Produces: the class names listed in Global Constraints, with the tokens from GLB §6.1 as `:root` custom properties `--ink --ink2 --ink3 --bg --card --line --line2 --phx --phx2 --phx3 --grn --grn2 --amb --amb2 --red --red2 --blu --blu2 --pur --pur2 --r --sb`; the `@media (max-width: 980px)` rules from GLB §4.9 **minus** the stacked-sidebar rule (the shell keeps slice 1's drawer).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/console-css.test.ts
import { readFileSync } from 'node:fs'
const css = readFileSync('src/styles/console.css', 'utf8')
it.each(['.btn.p', '.mc .v', '.cc .cv', '.hero .art', '.st-live', '.st-declined', '.pill[aria-pressed=true]',
  '.q', '.notif', '.modal.on', '.phone', '.fun .fb', '.hbar .b', '.lead .rk', '.empty', '.toast.on', '.sw[aria-checked=true]',
  '.opt[aria-pressed=true]', '.drop', '.est', '.steps', '.kv', '.tagp', '.warn', '.crumb', '.head h1', '.wrap', '.two'])(
  'defines %s', (sel) => expect(css).toContain(sel))
it('declares every token', () => {
  for (const t of ['--ink:#14171D', '--phx:#FF5A1F', '--grn:#0E9F6E', '--amb:#B7791F', '--red:#C53030', '--blu:#2B5FD9', '--pur:#6C5CE7', '--r:14px', '--sb:248px'])
    expect(css.replace(/\s/g, '')).toContain(t)
})
it('adds the missing declined pill', () => expect(css).toMatch(/\.st-declined\{background:var\(--red2\);color:var\(--red\)\}/))
```

- [ ] **Step 2: Run it to make sure it fails** — `npx vitest run tests/unit/console-css.test.ts` → FAIL (file missing)
- [ ] **Step 3: Port the CSS.** Copy the second `<style>` block of `offergrid-v4.html` into `console.css`; drop `.app`, `.side`, `.top` grid rules that slice 1's shell replaces (keep their visual rules for `.brand`, `.grp`, `.side nav button`, `.search`, `.bell`, `.wsbtn`, `.who`, `.banner` so the shell task can use them); add `.st-declined`; in the media query remove `.app{grid-template-columns:1fr}.side{position:static;height:auto}` and add `table,pre{display:block;overflow-x:auto}` for `.box table`.
- [ ] **Step 4: Run the test and `npm run lint`** → PASS, lint clean (the eslint exemption added).
- [ ] **Step 5: Commit** — `git commit -m "feat(design): port the prototype's stylesheet as the console stylesheet"`

---

### Task 2: Formatting helpers

**Files:**
- Modify: `src/lib/format.ts`
- Test: `tests/unit/format.test.ts`

**Interfaces:**
- Produces: `fmt(n: number): string`, `usd(cents: number): string` (whole dollars, thousands separators, U+2212 minus), `usdFromDollars(n: number): string`, `loc(cents: number, country: Country, fxPerUsd: number): string` (symbol, no space, rounded, separators), `pct(a: number, b: number): string`, `fd(d: Date, tz: string): string` ("16 Nov"), `daysLeft(end: Date, now: Date): number`, `initials(name: string): string` (letters only, ignores parenthesised suffixes: "MediaSpec (agency)" → "M", "Kola Bright" → "KB", "777Bet" → "7B"), `maskPhone(e164: string): string` ("+2348012344471" → "+234 80• ••• 4471").

- [ ] **Step 1: Failing tests** with ADV §0 examples: `fmt(57600)='57.6k'`, `fmt(1330000)='1.33M'`, `fmt(317)='317'`; `usd(111500)='$1,115'`, `usd(-55700)='−$557'`; `loc(30000,'NG',1550)='₦465,000'`, `loc(-11800,'NG',1550)='−₦182,900'`; `pct(3,0)='0%'`, `pct(61,1000)='6.1%'`; `fd(new Date('2026-11-16T12:00Z'),'Africa/Lagos')='16 Nov'`; `daysLeft` floors at 0; `initials('MediaSpec (agency)')='M'`; `maskPhone`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(lib): prototype number, money, date and initials formatting`

---

### Task 3: Schema delta and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_slice2/migration.sql` (via `prisma migrate dev --create-only` on the test DB with `dotenv -e .env.test`, then `migrate deploy`)
- Test: `tests/unit/schema.test.ts`

**Interfaces (produces, exact names):**
- Enums: `CampaignStatus` += `scheduled`, `ended`; `ChannelEventType` += `ShareOpen`, `ShareClaim` (keep `Share`); `RejectReason { misleading_terms, not_available, broken_link, prohibited_category, missing_licence, creative_standards }`; `InvoiceStatus { open, due, paid }` (overdue is derived); `LedgerKind { delivery, reward, payment, credit, refund }`; `PayoutStatus { queued, sent, held, blocked, rejected }`; `NotificationKind { approved, credit, pace, ended, weekly, review, system }`; `CreditRequestStatus { open, approved, dismissed }`.
- `Workspace` += `creditLimitCents Int @default(50000)`, `registrationNumber String?`, `accountManager String @default("Obinna A.")`, `termsDays Int @default(14)`, `approvedAt DateTime?`, `rewardMaxPerSharerPerDay Int @default(5)`, `rewardCapPct Int @default(20)`, `pointsPerShare Int @default(10)`.
- `Campaign` += `creativeVideoKey String?`, `ageGated Boolean @default(false)`, `rewardLocal Int @default(0)`, `rewardCapPct Int @default(20)`, `cpmCents Int?`, `fxPerUsd Decimal?`, `rejectReasonCode RejectReason?`, `endedAt DateTime?`, `pausedBy String?` (`'credit' | 'user' | null`), `version Int @default(1)`. Keep `rejectReason` as the note.
- New models: `Invitation {id, workspaceId, email, role Role, token @unique, invitedById, expiresAt, acceptedAt?, revokedAt?}`, `Notification {id, userId?, workspaceId?, kind, title, detail String?, href String?, createdAt, readAt?}`, `NotificationPref {userId, workspaceId, kind NotificationKind, enabled Boolean; @@id([userId, workspaceId, kind])}`, `AuditEvent {id, actorId, action String, targetType String, targetId String, workspaceId?, before Json?, after Json?, at}`, `CreditRequest {id, workspaceId, requestedById, status, note?, createdAt, decidedAt?, decidedById?}`, `CampaignRevision {id, campaignId, data Json, status (review|rejected|applied), rejectReasonCode?, rejectReason?, submittedAt, decidedAt?}`, `LedgerEntry {id, workspaceId, at, description, amountCents Int, kind, campaignId?, invoiceId?, dedupeKey String? @unique}`, `Invoice {id, workspaceId, number String @unique, period DateTime, amountCents, fxPerUsd Decimal, status InvoiceStatus, issuedAt, dueAt, paidAt?}`, `RateCard {id, channelId, country, placement, cpmCents, effectiveFrom; @@index([channelId, country, placement, effectiveFrom])}`, `MarketFx {id, country, fxPerUsd Decimal, effectiveFrom}`, `ChannelShare {id, channelId, share Decimal, effectiveFrom}`, `SettlementStatement {id, channelId, period, amountCents, status (open|paid), paidAt?; @@unique([channelId, period])}`, `RewardPayout {id, campaignId, workspaceId, shareLinkId, sharerConsumerId?, sharerSessionId?, claimEventKey String @unique, amountLocal Int, amountCents Int, status PayoutStatus, reason String?, createdAt, sentAt?}`, `PointsLedger {id, consumerId?, sharerSessionId?, campaignId, points Int, createdAt}`, `AggregatorAccount {id @default("reloadly"), balanceCents Int}`, `AggregatorTopup {id, amountCents, byUserId, at}`, `FraudRule {key @id, label, action String, enabled Boolean}`, `ClaimCode {id, code @unique, campaignId, channelId, sessionId, validUntil, createdAt; @@unique([campaignId, channelId, sessionId, day])}` with `day DateTime` (UTC date), `JobRun {id, name, day DateTime, ranAt; @@unique([name, day])}`. `Channel` += `previousKeyHash String?`, `previousKeyValidUntil DateTime?`, `keyCreatedAt DateTime @default(now())`. `ShareVia` += `facebook`. `RewardPayout.reason` values: `no_phone | same_device | cap_per_sharer | platform_cap | phone_reuse | cap | manual`.

- [ ] **Step 1: Failing test** — `tests/unit/schema.test.ts` creates one row of each new model with minimal data inside a workspace and asserts `db.campaign.create({ data: { ..., status: 'scheduled' } })` works and `RejectReason` has six values via `Object.keys(RejectReason)`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Edit schema, create the migration, `prisma generate`.** Verify `dotenv -e .env.test -- prisma migrate deploy` applies on an empty test DB and `npm run db:seed` (slice-1 seed) still succeeds against the test DB with `SEED_FORCE=1`.
- [ ] **Step 4: Run the whole suite** → PASS (adjust slice-1 tests that enumerate statuses: `campaign-status.test.ts`).
- [ ] **Step 5: Commit** — `feat(db): slice-2 schema: roles, invites, notifications, audit, money, rates, rewards, settlement`

---

### Task 4: Permissions, active workspace, audit, notifications

**Files:**
- Create: `src/lib/permissions.ts`, `src/lib/active-workspace.ts`, `src/lib/audit.ts`, `src/lib/notifications.ts`, `src/lib/copy-notifications.ts`
- Modify: `src/lib/workspaces.ts` (replace `requireWorkspace`/`isImpersonating` with the new module; keep exports as thin wrappers), `src/lib/session.ts`
- Test: `tests/unit/permissions.test.ts`, `tests/unit/active-workspace.test.ts`, `tests/unit/notifications.test.ts`, `tests/unit/audit.test.ts`

**Interfaces:**
- `type Capability = 'view' | 'campaigns' | 'rewards' | 'billing' | 'requestCredit' | 'people' | 'settings'`
- `can(role: Role | 'Global', cap: Capability): boolean` per the spec §6.2 table.
- `requireMember(cap: Capability): Promise<{ user: SessionUser; workspace: Workspace; role: Role | 'Global' }>` — resolves the active workspace (cookie `of_ws` validated against membership; Global may pick any), throws `'FORBIDDEN'` when `!can(role, cap)`, redirects to `/app/new-workspace` when the user has none.
- `setActiveWorkspace(id: string): Promise<void>` (server action helper; Global or member only), `listSwitcher(user): Promise<{ id, name, type, country, status }[]>` (members' workspaces; for Global every workspace).
- `audit(actorId, action, target: { type, id, workspaceId? }, before?, after?): Promise<void>`
- `notifyWorkspace(workspaceId, kind, title, detail?, href?)` → one `Notification` per member whose pref allows the kind (prefs default on except `weekly`); `notifyGlobal(kind, title, detail?, href?)`; `unreadCount(userId, workspaceId | null)`; `listNotifications(userId, workspaceId | null, limit=20)`; `markRead(id, userId)`; `getPrefs(userId, workspaceId)`, `setPref(userId, workspaceId, kind, enabled)`.
- `copy-notifications.ts`: every notification title/detail from ADV §12 and GLB §4.4 as functions.

- [ ] **Step 1: Failing tests** — `can('Viewer','campaigns')===false`, `can('Manager','people')===false`, `can('Owner','settings')===true`, `can('Global','people')===true`; `requireMember` for a Viewer calling `'campaigns'` rejects with `FORBIDDEN` (mock `cookies()` and `auth()` as `session.test.ts` does); Global with `of_ws` set to any workspace resolves it; a non-member with a forged `of_ws` falls back to their own; `notifyWorkspace` skips a member who turned the kind off; `markRead` ignores other users' rows; `audit` stores before/after.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(core): role permissions, active workspace, audit log, in-app notifications`

---

### Task 5: The shell (sidebar, topbar, banner, page head, toast, modal, switcher)

**Files:**
- Create: `src/components/shell/{Sidebar,TopBar,Banner,PageHead,Toast,Modal,Switcher,BellPanel,Icons}.tsx`, `src/components/shell/toast-store.ts` (client store), `src/lib/nav.ts`, `src/lib/copy-shell.ts`, `src/app/app/(console)/switch/actions.ts`
- Modify: `src/app/app/(console)/layout.tsx`, `src/app/admin/layout.tsx`, delete `src/components/console/{Sidebar,TopBar,PageHead,ImpersonationBanner}.tsx` after callers move.
- Test: `tests/unit/nav.test.ts`, `tests/unit/shell-pages.test.ts`

**Interfaces:**
- `navFor(ctx: { role: Role | 'Global'; inWorkspace: boolean; counts: { campaigns: number; invoices: number; review: number } }): NavGroup[]` — groups and labels per GLB §4.2 (CAMPAIGNS, GROWTH, MONEY, ORGANISATION, and PLATFORM only for Global); hrefs per spec §6.12; counts shown when > 0.
- `Sidebar({ brand: { initials, name, sub, tile: 'ink' | 'phx' }, groups, footer })`; `TopBar({ unread, switcher, avatar, isGlobal })`; `Banner({ kind: 'pending' | 'declined' | 'global' | 'globalInside', workspaceName?, reason? })`; `PageHead({ crumb: { label, href? }[], title, lead?, actions? })` rendering `.crumb` / `.head`; `Modal({ open, onClose, title, children })` with focus trap + Escape; `toast(msg)` client function rendering `.toast.on` for 2.2 s.
- Layouts: workspace layout computes `requireMember('view')`, counts, unread, banner kind (Global inside → `'globalInside'`), renders `.app`-equivalent grid using slice-1's drawer below 980 px. Admin layout: Global only, PLATFORM nav, `'global'` banner, brand "OF"/"OshoFree"/"Platform console".

- [ ] **Step 1: Failing tests** — `navFor` for Owner in workspace has 5 groups without PLATFORM; for Global in workspace has PLATFORM appended; counts hidden at 0; `shell-pages.test.ts` renders the workspace layout (as `admin-pages.test.ts` does) for a Global user with `of_ws` and asserts the banner text `you are acting as Global inside Kola Bright` and the "Back to Platform" link; for a Viewer asserts no PLATFORM link.
- [ ] **Step 2: Run** → FAIL. **Step 3: Build the shell** with the prototype classes (`.brand`, `.grp`, nav buttons as `<Link aria-current>`, `.cnt`, `.search` as a `<button>`, `.bell` with Lucide `Bell`, `.wsbtn` opening `Switcher` popover listing `listSwitcher()` rows with `.st` pills, `.who` avatar with `initials()` or "GL"). Copy from GLB §4 and ADV §0 in `copy-shell.ts`.
- [ ] **Step 4: Run tests, type-check, lint** → PASS.
- [ ] **Step 5: Commit** — `feat(shell): the prototype's sidebar, topbar, switcher, banner, page head, toast and modal`

---

### Task 6: UI components from the prototype's classes

**Files:**
- Create: `src/components/og/{Button,StatusBadge,MetricCard,Box,FilterPills,KVGrid,EstimatePanel,Steps,HBarList,Leaderboard,Funnel,BarChart14d,CampaignCard,HeroCampaignCard,NewCampaignTile,EmptyState,OptionTile,Swatches,DropZone,ToggleRow,AlertBox,TokenChip,DataTable}.tsx`, `src/components/og/index.ts`
- Test: `tests/unit/og-components.test.tsx` (render with `react-dom/server`'s `renderToStaticMarkup`)

**Interfaces (props, exact):**
- `Button({ variant?: 'primary'|'dark'|'ghost'|'default', size?: 's'|'lg', danger?: boolean, ...button props })` → `.btn` + `.p/.d/.g` + `.s/.lg`, danger = ghost with red text.
- `StatusBadge({ status: 'live'|'review'|'scheduled'|'paused'|'rejected'|'ended'|'draft'|'paid'|'due'|'overdue'|'issued'|'pending'|'approved'|'declined' })` → `.st.st-<status>` with labels from GLB §2.7 (+ "Declined").
- `MetricCard({ title, value, sub, fill?: number, openHref? })` → `.mc`.
- `CampaignCard({ campaign: CardModel, href? })` where `CardModel = { headline, brand, country, status, placement, ageGated, imageUrl?, color, initials, daysLeft?, mainLeft, mainRight?, spendPct? }` per ADV §1 "CampaignCard anatomy".
- `HeroCampaignCard({ model: HeroModel })` per ADV §1 item 3; `BarChart14d({ values: number[] })` (SVG per GLB §6.5); `Funnel({ rows: { label, value }[] , base: number })`; `HBarList({ rows: { label, value, display }[] })`; `Leaderboard({ rows: { phone, claims }[] })`; `OptionTile({ pressed, title, desc, big, soon? })`; `Swatches({ colors, value, onChange })`; `DropZone({ label, hint, zoneTitle, zoneHint, preview?, onPick, onRemove })`; `ToggleRow({ label, sub, checked, onChange })`; `DataTable` = styled `<table>` wrapper with `emptyText`.

- [ ] **Step 1: Failing tests** — each component renders its root class and the given copy; `StatusBadge('declined')` renders "Declined"; `BarChart14d` renders 14 `<rect>` with the last `fill="#FF5A1F"`; `Button danger` includes inline red; `MetricCard fill=55` renders width 55%.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(ui): prototype components`

---

### Task 7: Rates, FX and channel share, with the Rates page

**Files:**
- Create: `src/lib/rates.ts`, `src/lib/copy-rates.ts`, `src/app/admin/rates/{page.tsx,actions.ts,RatesTable.tsx}`
- Test: `tests/unit/rates.test.ts`, `tests/unit/rates-page.test.ts`

**Interfaces:**
- `currentCpmCents(channelId, country, placement, at = new Date()): Promise<number>`; `setRate(channelId, country, placement, cpmCents, byUserId)` inserts a row `effectiveFrom = now` and audits; `rateTable(channelId, at)` → rows per country × placement; `currentFx(country, at)`, `setFx(country, fxPerUsd, byUserId)`; `currentShare(channelId, at)`, `setShare(channelId, share, byUserId)` (0 ≤ share ≤ 1 else `'INVALID'`); `EXPECTED_OPEN_RATE = { card: .036, featured: .055, video: .07, splash: .09 }`.
- Rates page per GLB §2.3 with the FX column editable; cell edits via server action on `change`, toast "Rate updated for new campaigns".

- [ ] **Step 1: Failing tests** — two rate rows for NG/card with `effectiveFrom` yesterday (120) and tomorrow (180): `currentCpmCents` today = 120; `setRate` leaves the old row; `setShare(1.5)` rejects; page test (as `admin-pages.test.ts`) renders five country rows and `Boomplay`/`coming soon`; a non-admin is refused.
- [ ] **Step 2–4.** **Step 5: Commit** — `feat(platform): rate card, FX and Phoenix share with effective dates; Rates page`

---

### Task 8: Money: ledger, invoices, credit, close month, mark paid, credit requests

**Files:**
- Create: `src/lib/money.ts`, `src/lib/copy-money.ts`
- Test: `tests/unit/money.test.ts`

**Interfaces:**
- `postLedger(workspaceId, { at, description, amountCents, kind, campaignId?, invoiceId?, dedupeKey? })` (dedupeKey makes it idempotent).
- `statement(workspaceId, month: Date)` → rows newest first; `unbilledCents(workspaceId)` = −Σ charges since the last issued invoice's period end; `outstandingCents(workspaceId)` = Σ due/overdue invoices; `committedCents(workspaceId)` = Σ(budget − spend) over live/review/scheduled/paused (spend from `campaignSpendCents`, Task 12 provides it; until then use Σ ledger charges per campaign); `creditInUseCents`, `availableCents`, `creditSummary(workspaceId)` → `{ limit, inUse, available, unbilled, nearLimit }`.
- `closeMonth(period: Date, byUserId)` → for every workspace with charges in `period`: creates `Invoice` (`number = nextInvoiceNumber()` from 52 upward as `INV-0052`, `fxPerUsd = currentFx(country)`, `status: due`, `dueAt = issuedAt + termsDays`), links the ledger rows, generates `SettlementStatement` per channel (Σ delivery charges × share effective in `period`); idempotent per period.
- `invoiceStatus(inv, now)` → `'open'|'due'|'overdue'|'paid'`; `markInvoicePaid(id, byUserId)` posts a `payment` ledger row "INV-00xx paid" and audits; `requestCredit(workspaceId, byUserId, note?)`, `decideCredit(id, byUserId, decision, newLimitCents?)`.
- `canSubmitBudget(workspaceId, budgetCents, increaseOnly?)` → `{ ok, excessCents }` for the form hint.

- [ ] **Step 1: Failing tests** — fixture: workspace limit $1,500, one live campaign budget $300 spend $133, one review campaign $400, an overdue invoice $210, unbilled −$135: `creditInUseCents = 21000+40000+16700+13500 = ... ` (write the expected number explicitly), ended/rejected campaigns excluded; `closeMonth` twice creates one invoice; `markInvoicePaid` releases credit and posts the payment line; `invoiceStatus` overdue when `dueAt < now`; `canSubmitBudget` excess copy input.
- [ ] **Step 2–4.** **Step 5: Commit** — `feat(money): ledger, monthly invoices, credit in use, close month, mark paid, credit requests`

---

### Task 9: Campaign lifecycle v2

**Files:**
- Modify: `src/lib/campaigns.ts`, `src/lib/campaign-status.ts` (statuses are now stored; keep `deliveringWhere` = `status in (live)`), `src/lib/copy-campaign.ts` (new, toasts from ADV §1–2)
- Test: `tests/unit/campaigns.test.ts` (extend), `tests/unit/campaign-lifecycle.test.ts`

**Interfaces:**
- `submitCampaign(id, byUserId)` snapshots `cpmCents` and `fxPerUsd`, checks `canSubmitBudget`, sets `review`, notifies "{name} is in review".
- `approveCampaign(id, byUserId, now)` → `scheduled` if `startsAt > now` (market midnight) else `live`; `ReviewAction`; notification per ADV §12; refuses when workspace not approved.
- `rejectCampaign(id, byUserId, code: RejectReason, note)`.
- `pauseCampaign(id, byUserId)`, `resumeCampaign(id, byUserId)` (refuses `'CREDIT_LIMIT'` when in use > limit), `endCampaign(id, byUserId)` → `ended`, `endedAt`, returns `releasedCents`.
- `changeWithoutReview(id, byUserId, { budgetUsd?, endsAt?, rewardLocal? })` rules from ADV §2 (budget ≥ spend, credit, end after start).
- `editOffer(id, byUserId, input)`: live, scheduled or paused → `CampaignRevision(review)` holding only the offer fields (brand, category, headline, description, tileColor, creativeImageKey, creativeVideoKey, placement, redeemMethod, claimCode, linkUrl, ageGated) and notification "{name} is in review"; draft/review/rejected/ended → overwrite + `review`. `approveRevision(revisionId, byUserId)` applies the fields and bumps `version`; `rejectRevision(revisionId, byUserId, code, note)` leaves the campaign as it was and stores the decision on the revision (spec §6.14.3). `pendingRevision(campaignId)` for the status line.
- `campaignSpendCents(id)` = Σ ledger charges for the campaign; `campaignFacts(id)` → `{ status, daysLeft, spendCents, leftCents, pace, paceNote }` with pace per ADV §1.

- [ ] **Step 1: Failing tests** — approve with future start → scheduled; approve while workspace pending → `'WORKSPACE_NOT_APPROVED'`; resume over limit → `'CREDIT_LIMIT'`; endCampaign releases budget − spend; editOffer on live creates a revision and keeps status live; applying swaps fields and bumps `version`; `changeWithoutReview` budget below spend → `'BUDGET_BELOW_SPEND'`; pace bands.
- [ ] **Step 2–4.** **Step 5: Commit** — `feat(campaigns): stored statuses, rate snapshots, reason codes, credit-aware resume, end now, live revisions`

---

### Task 10: Campaign input v2 and the cost estimate

**Files:**
- Modify: `src/lib/campaign-schema.ts`
- Create: `src/lib/estimate.ts`, `src/lib/copy-campaign-form.ts` (replace contents with ADV §3 copy)
- Test: `tests/unit/campaign-schema.test.ts`, `tests/unit/estimate.test.ts`

**Interfaces:**
- `campaignInput` += `placement: z.enum(['card','featured','video','splash'])`, `creativeVideoKey?`, `rewardLocal: z.number().int().min(0)`, `runsForDays ∈ {7,14,30} | custom with endsAt`, `tileColor` required; drop `shareRewardLabel` (derived: "Earn {sym}{reward} airtime"); `validateCampaign(i, ctx: { workspaceType, creditAvailableCents, cpmCents })` returns the **first** failing message in ADV §3 order (11 rules, verbatim) or `null`.
- `ageGated(i)` = category Betting or headline matches `/jackpot|bet/i`.
- `estimate({ budgetUsd, placement, cpmCents, rewardLocal, fxPerUsd, days, capPct=20 })` → `{ impressions, perDay, opens, successfulShares, rewardCents, capCents, budgetLocal }` with ADV §3 formulas; test the Kola defaults: 200.0k, 14.3k/day, ~7.2k opens, est. 428 shares, $14.

- [ ] **Steps 1–4.** **Step 5: Commit** — `feat(campaigns): form rules in prototype order and the cost estimate`

---

### Task 11: Creative upload for images, video and splash

**Files:**
- Modify: `src/lib/storage.ts` (`putCreative(file): Promise<{ key, kind: 'image'|'video' }>`, 2 MB cap, MP4 and image types), `src/lib/image-rules.ts`, `src/app/api/upload/route.ts`, `src/app/uploads/[key]/route.ts`
- Test: `tests/unit/upload-routes.test.ts` (extend)

- [ ] **Step 1: Failing tests** — an MP4 ≤ 2 MB is stored with kind video; 2.1 MB refused `'too_large'`; a `.mov` refused; a GIF refused.
- [ ] **Steps 2–4.** **Step 5: Commit** — `feat(upload): video and splash creatives`

---

### Task 12: Reports v2 — every number from rows

**Files:**
- Modify: `src/lib/reports.ts` (rewrite around the new shapes), `src/lib/copy-report.ts`
- Test: `tests/unit/reports.test.ts` (rewrite)

**Interfaces:**
- `campaignMetrics(id, now)` → `{ imp, opens, claims, shares, sOpens, sClaims, spendCents, rewardCents, days: number[14] (market-local days, last = today), channels: { whatsapp, x, facebook, sms }, topSharers: { phone, claims }[5], openRate, costPerClaimCents | null, viral, friendClaimRate }`. Sources (spec §6.14.2): `ChannelEvent` Impression/Open/Claim (imp/opens/claims); shares = `ShareLink` rows with `sharerType in (Channel, Consumer)` and a `via`; sOpens = `LinkEvent Open` on depth ≥ 1 links only; sClaims = `RewardPayout` rows with status not `blocked`/`rejected` — the successful-share definition; Phoenix `ShareOpen`/`ShareClaim` events are never counted here; `spendCents` from ledger; channels from `ShareLink.via` (`whatsapp`, `x`, `facebook`, `sms`; `copy`/`other` excluded from the split).
- `workspaceSharing(workspaceId)` (totals + by-campaign rows + channel percentages sorted), `pointsIssued(workspaceId)`, `heroCampaign(workspaceId, now)` (ADV §1 rule), `homeCards(workspaceId, filter, now)`, `platformKpis(now)` (GLB §2.1 block 1), `settlementByMarket(channelId, month)`, `rewardsLedgerRows()`.

- [ ] **Step 1: Failing tests** — fixture of events over two market days near midnight Lagos: bucketing puts 23:30 Lagos in the right day; `sClaims` counts payouts not raw claims; channels percentages; hero rule prefers live over paused over review over scheduled; `platformKpis.owedCents = gross × share`.
- [ ] **Steps 2–4.** **Step 5: Commit** — `feat(reports): the prototype's metrics computed from events, payouts and the ledger`

---

### Task 13: People page and invitations

**Files:**
- Create: `src/lib/invitations.ts`, `src/app/app/(console)/people/{page.tsx,actions.ts,PeopleClient.tsx}`, `src/app/invite/[token]/{page.tsx,actions.ts}`, `src/lib/copy-people.ts`
- Test: `tests/unit/invitations.test.ts`, `tests/unit/people-actions.test.ts`

**Interfaces:** `invite(workspaceId, byUserId, email, role)` (valid email else `'INVALID_EMAIL'`; token 32 hex; 7 days), `revokeInvite(id)`, `inviteUrl(token)`, `acceptInvite(token, user)` (expired → `'EXPIRED'`), `changeRole(workspaceId, userId, role, byUserId)` (last Owner → `'LAST_OWNER'`), `removeMember(...)`. Page per ADV §9: Members list (`MemberRow` with real role select), pending rows "Invited · {role}" + "Copy invite link" + "Revoke", Invite box, "What each role can do".

- [ ] **Step 1: Failing tests** — permission: Manager calling `invite` → `FORBIDDEN`; invalid email; accept joins with the role; demoting the only Owner refused; expired token refused.
- [ ] **Steps 2–4.** **Step 5: Commit** — `feat(people): members, roles and invite links`

---

### Task 14: Workspace page

**Files:**
- Modify: `src/app/app/(console)/workspace/{page.tsx,actions.ts}`, `src/lib/workspace-schema.ts` (+ `registrationNumber`), `src/lib/copy.ts` (workspace copy from ADV §10)
- Test: `tests/unit/workspace-actions.test.ts`

- [ ] **Step 1: Failing tests** — Save persists name and registration number (Owner only; Manager → `FORBIDDEN`); type and billing country persist only while the workspace is `pending` (an approved workspace's Owner gets `'LOCKED'`; Global may change them, spec §6.14.6); the Status box data builder returns `since: 'Oct 2026'` from `createdAt`; agency `clientBrands(workspaceId)` returns distinct brands with counts.
- [ ] **Steps 2–4.** Page: form + Status KVGrid + agency "Client workspaces" box with "+ Add client brand" → `/app/campaigns/new?brand=`.
- [ ] **Step 5: Commit** — `feat(workspace): settings that persist, status box, client brands`

---

### Task 15: Notifications page and bell panel

**Files:**
- Create: `src/app/app/(console)/notifications/{page.tsx,actions.ts}`, `src/app/admin/notifications/actions.ts` (markRead for Global), `src/components/shell/BellPanel.tsx` wiring (from Task 5)
- Test: `tests/unit/notifications-page.test.ts`

- [ ] **Step 1: Failing tests** — toggles persist per user+workspace; the bell panel data (`listNotifications`) is ordered newest first with "{detail} · {age}" formatting via `ageLabel(createdAt, now)` ("now", "2h ago", "1d ago"); `markRead` action requires the row's user.
- [ ] **Steps 2–4.** Page per ADV §11 (five ToggleRows, Recent box); bell per GLB §4.4 with unread count and click-through.
- [ ] **Step 5: Commit** — `feat(notifications): settings page and a bell that reads and navigates`

---

### Task 16: New campaign form and Edit offer

**Files:**
- Rewrite: `src/components/campaign/CampaignForm.tsx` and `src/components/campaign/form/*` into one form per ADV §3 (`FormGrid`, fields in order, `OptionTile` placements with live CPM from `rateTable`, `DropZone` per placement, redeem, budget/runs/start/reward, terms, button row with first-error hint), `src/components/campaign/form/CardPreview.tsx`, `src/components/campaign/form/CostBox.tsx`, `src/lib/draft-store.ts` (localStorage, keyed by workspace)
- Modify: `src/app/app/(console)/campaigns/new/page.tsx` (`?brand=` prefill), `src/app/app/(console)/campaigns/[id]/edit/page.tsx`, `src/app/app/(console)/campaigns/actions.ts`
- Test: `tests/unit/campaign-actions.test.ts` (extend)

- [ ] **Step 1: Failing tests** — `submitAction` for a Viewer → `FORBIDDEN`; submit returns the campaign id and the toast key; `editOfferAction` on a live campaign returns `revision: true`; `cancel` keeps the campaign unchanged.
- [ ] **Steps 2–4.** Client: live validation order, headline counter "— n/48", "See it on Phoenix" (Task 17), Edit mode copy (crumb "Edit offer", lead, "Save and resubmit", "Cancel"), draft autosave cleared on submit/cancel/switch.
- [ ] **Step 5: Commit** — `feat(campaigns): the one-page form with live cost, card preview and edit mode`

---

### Task 17: "On Phoenix" preview modal

**Files:**
- Rewrite: `src/components/campaign/{PhonePreview,PhoneFrame,PreviewButton}.tsx`, `src/lib/preview-merge.ts` (`previewWall(previewed, liveInMarket)` → `{ featured?: Offer, tiles: Offer[] }` per GLB §5.1 rules)
- Test: `tests/unit/preview-merge.test.ts` (rewrite)

- [ ] **Step 1: Failing tests** — featured/video/splash previewed → it is the featured slot; card previewed with another featured live → that one; none → no tile; tiles = previewed first then ≤ 5 others.
- [ ] **Steps 2–4.** Modal via `Modal`; splash renders a full-screen takeover inside the phone with "Skip"; video renders a poster with ▶.
- [ ] **Step 5: Commit** — `feat(preview): the Phoenix wall mock with featured, splash and video`

---

### Task 18: Campaigns home

**Files:**
- Rewrite: `src/app/app/(console)/page.tsx`, `src/components/campaign/{CampaignHero→HeroCampaignCard usage, StatusFilter→FilterPills}.tsx`, `src/lib/campaign-filters.ts`, `src/lib/copy-home.ts`
- Test: `tests/unit/home-page.test.ts`

- [ ] **Step 1: Failing tests** — greeting by hour (mock `now`); filter counts; Scheduled/Rejected pills only when present; hero excluded from the grid; empty state copy for a workspace with no campaigns; "Simulate a day" absent without `DEMO_CONTROLS`.
- [ ] **Steps 2–4** per ADV §1. **Step 5: Commit** — `feat(home): greeting, pills, hero card, card grid`

---

### Task 19: Campaign page

**Files:**
- Rewrite: `src/app/app/(console)/campaigns/[id]/page.tsx`, `src/components/campaign/{ChangePanel,OfferBox,EndCampaignModal,SharingBox,HistoryList}.tsx`, `src/app/app/(console)/campaigns/actions.ts` (+ `changeWithoutReviewAction`, `endCampaignAction`)
- Test: `tests/unit/campaign-page.test.ts`

- [ ] **Step 1: Failing tests** — per-status head actions and chart sub-lines (ADV §2 table, rejected → "Not approved."); rejected status line shows "{code label}: {note}"; Save disabled for ended/rejected; live-with-revision status line.
- [ ] **Steps 2–4.** **Step 5: Commit** — `feat(campaign): report, sharing, change-without-review, the offer, end now, history`

---

### Task 20: Sharing page

**Files:** Create `src/app/app/(console)/sharing/page.tsx` (rewrite), `src/lib/copy-sharing.ts`. Test: `tests/unit/sharing-page.test.ts`.
- [ ] Tests: KPI totals across all campaigns incl. ended; "Where people share" sorted desc with percentages; by-campaign rows link to campaigns; points = sClaims × 10.
- [ ] Build per ADV §5. Commit — `feat(sharing): KPIs, how a share works, by campaign, where people share, points`

---

### Task 21: Rewards page

**Files:** Create `src/app/app/(console)/rewards/{page.tsx,actions.ts}`, `src/lib/copy-rewards.ts`. Test: `tests/unit/rewards-actions.test.ts`.
- [ ] Tests: inline reward change persists `rewardLocal` and audits; caps Save persists the three workspace fields and lowers every campaign's `rewardCapPct` to at most the workspace value (spec §6.14.4); Viewer refused; ended/rejected excluded from the table.
- [ ] Build per ADV §6. Commit — `feat(rewards): per-campaign airtime and workspace caps that persist`

---

### Task 22: Billing & credit page

**Files:** Create `src/app/app/(console)/billing/{page.tsx,actions.ts,StatementBox.tsx}`. Test: `tests/unit/billing-page.test.ts`.
- [ ] Tests: KPI values from `creditSummary`; alert only when in use > limit; statement rows newest first with payments green; month selector lists months with rows; "Request a higher limit" creates one open `CreditRequest` (Owner only) and toasts.
- [ ] Build per ADV §7 ("How you pay" quotes `currentFx` for this month). Commit — `feat(billing): credit, statement, how you pay, credit requests`

---

### Task 23: Invoices page and print view

**Files:** Create `src/app/app/(console)/invoices/page.tsx`, `src/app/app/(console)/invoices/[id]/print/page.tsx`. Test: `tests/unit/invoices-page.test.ts`.
- [ ] Tests: the "(to date)" row shows `unbilledCents`; statuses derived; no "Mark paid" for advertisers; print page lists lines, totals in USD and local at the invoice FX, due date, and is forbidden for another workspace.
- [ ] Build per ADV §8. Commit — `feat(invoices): list and printable invoice`

---

### Task 24: Search palette (⌘K)

**Files:** Create `src/lib/search.ts`, `src/components/shell/Palette.tsx`, `src/app/app/(console)/search/actions.ts`, `src/app/admin/search/actions.ts`. Test: `tests/unit/search.test.ts`.
- [ ] Tests: `searchWorkspace(workspaceId, q)` groups campaigns (name/headline/brand), invoices (number), people (name/email), ≤ 5 each, case-insensitive; `searchPlatform(q)` groups workspaces and campaigns; a Viewer gets results (read-only); query shorter than 2 chars → empty.
- [ ] Build: topbar search button and ⌘K/Ctrl+K open the palette; arrow keys; Enter opens first; Escape closes. Commit — `feat(search): the command palette`

---

### Task 25: Channel API v2

**Files:** Modify `src/lib/events.ts` (types `impression|open|claim|share|share_open|share_claim`, optional `placement`, `token`, `via`, `claim_code`), `src/lib/offers.ts` (wire shape per GLB §2.6: `placement`, `creative { image, video, color }`, `cta`, `flags { sponsored, age_18 }`, `share { enabled, reward_label }`, `ends_at`), create `src/app/api/v1/claims/route.ts` + `src/lib/claims.ts` (`issueClaimCode(campaignId, channelId, sessionId, now)` → `PHX-XXXX`, one per session per offer per UTC day, `valid_until` = campaign end), `src/lib/api-docs.ts` (GLB §2.6 content with OshoFree URLs), `src/app/admin/api/page.tsx`. Tests: `tests/unit/channel-api.test.ts` (extend), `tests/unit/claims.test.ts`.
- Also: `POST /share` accepts optional `msisdn` (E.164; `normalisePhone` by the offer's country; invalid → 400 `bad_request`); when present `upsertConsumer` and set `consumerId` on the minted Channel link (spec §6.14.1). `src/lib/channels.ts` += `rotateKey(channelId, byUserId)` → returns the new plain key once, moves the old hash to `previousKeyHash` valid 24 h; `channelFromRequest` accepts either while valid. Admin API page gains the "Keys" box (prefix, created, Rotate key) for Global (spec §6.14.7).
- [ ] Tests: offers carry `placement` and `flags.age_18`; `share_claim` with a token is stored as `ShareClaim` with `linkCode`; unknown type ignored; claims endpoint idempotent per day; 404 for an offer not delivering; `share` with `msisdn` links a Consumer; after `rotateKey` the old key works for 24 h then 401.
- [ ] Commit — `feat(api): share events, claim codes, sharer phone, key rotation and the prototype's offer shape`

---

### Task 26: Rewards engine

**Files:** Create `src/lib/rewards.ts`, `src/lib/fraud.ts`. Modify `src/lib/link-events.ts` (`recordClaim` calls `onSuccessfulShare`), `src/lib/events.ts` (ingest `share_claim` calls it). Test: `tests/unit/rewards.test.ts`, `tests/unit/fraud.test.ts`.
- `onSuccessfulShare({ campaignId, shareLinkId, claimEventKey, friendVisitorId | friendSessionId, friendPhone? , now })` → creates one `RewardPayout` (unique by `claimEventKey`), `amountLocal = campaign.rewardLocal`, `amountCents = round(amountLocal / fxPerUsd × 100)`, status by `fraud.evaluate(...)` in this order (spec §6.14.1, §6.14.2, §6.14.4): sharer link has no `consumerId` (no phone) → `held` reason `no_phone`; same device (friend visitor cookie equals the sharer's visitor cookie, or the friend's claim session equals the sharer's `sharerSessionId`) → `blocked` reason `same_device`; sharer's payouts today ≥ min(workspace `rewardMaxPerSharerPerDay`, 5 while the platform rule is enabled) → `held` reason `cap_per_sharer` / `platform_cap`; friend phone linked to ≥ 3 distinct sharers → `held` reason `phone_reuse`; campaign reward total would exceed `rewardCapPct` of budget → `rejected` reason `cap`; else `queued`. Posts the ledger line "{campaign} — share rewards" (dedupeKey = payout id) for queued payouts; adds `PointsLedger` with the workspace's `pointsPerShare`; `FraudRule` toggles honoured.
- `releasePayout(id, byUserId)`, `rejectPayout(id, byUserId)`, `sendQueuedPayouts(now)` (status sent, aggregator balance −amount).
- [ ] Tests: idempotent on replay; each fraud branch; cap; ledger line once; `sendQueuedPayouts` decrements the balance.
- [ ] Commit — `feat(rewards): payouts, fraud rules, points and the aggregator`

---

### Task 27: The daily job

**Files:** Create `src/lib/jobs/daily.ts`, `scripts/daily.ts`, `src/app/admin/review/actions.ts` (+ `runDailyJobAction`, demo-gated). Test: `tests/unit/daily-job.test.ts`.
- `runDaily(day: Date, now = day)`: guarded by `JobRun(name='daily', day)`; for each live campaign: impressions of that market-local day × `cpmCents / 1000` → ledger `delivery` (dedupeKey `delivery:<campaign>:<day>`); end when `spend ≥ budget` or `day ≥ endsAt` (notification "{name} ended" / "{fmt(imp)} impressions · {open rate} open rate" or "budget fully delivered"); start scheduled campaigns whose `startsAt ≤ day` (market midnight) → live + notification; pause live campaigns of workspaces over their limit (`pausedBy='credit'`, notification "{name} paused — credit limit reached"); `sendQueuedPayouts`; on the 1st `closeMonth(previous month)`; Mondays create the weekly digest for users with `weekly` on; pace notification when pace < 0.8 or > 1.2 and `pace` pref on (once per campaign per day).
- [ ] Tests: twice for the same day → one charge; a campaign ends at budget; scheduled starts at market midnight (23:30 UTC the day before Lagos midnight does not start it; 23:00 UTC does); over-limit pause; the 1st closes the month.
- [ ] Commit — `feat(jobs): the daily delivery, status and invoicing job`

---

### Task 28: "Simulate a day" (demo control)

**Files:** Create `src/lib/demo/simulate-day.ts`, `src/lib/demo/generator.ts`; actions on home, Sharing and Review (`simulateDayAction`, Global + `DEMO_CONTROLS=1` only). Test: `tests/unit/simulate-day.test.ts`.
- `generateDay(campaign, rng)` per ADV §15 (day budget, 0.88, open rate, 33 % claims, 9 % shares, 2.2× friend opens, 30 % friend claims, channel split 62/14/16/8) → channel events (impression/open/claim/share/share_open/share_claim with minted share links via `mintChannelLink` and `via` by split) posted through `ingestEvents` with a batch key `sim:<campaign>:<day>:<n>`, then `runDaily(day)`.
- [ ] Tests: a live campaign's metrics grow and a delivery ledger line appears; clicking twice on the same calendar day creates a second batch but `runDaily` is a no-op the second time (so charges once per day; document this); not Global → `FORBIDDEN`; without the env → `FORBIDDEN`.
- [ ] Commit — `feat(demo): simulate a day through the real pipeline`

---

### Task 29: Review page v2

**Files:** Rewrite `src/app/admin/review/{page.tsx,actions.ts}`, create `src/components/platform/{KpiStrip,NewAdvertisers,QueueRow,RejectModal,LiveNow}.tsx`, `src/lib/review.ts` (`reviewQueue(now)` → rows with cover, chips in GLB §2.1 order, warnings, link check result, `approveEnabled`), `src/lib/copy-review.ts`. Test: `tests/unit/review.test.ts` (extend), `tests/unit/admin-actions.test.ts` (extend).
- [ ] Tests: chip order and text (`reward ₦100`, `claim code`, dates "16 Nov – 30 Nov"); betting warning variants; pending/declined workspace disables approve; reject requires a code; after approve the queue no longer lists it; a pending `CampaignRevision` is a queue row titled "Revised offer · {headline}" with Approve → `approveRevision` and Reject → `rejectRevision`, and counts in the Review badge (spec §6.14.3); "Live now" models carry `href = /app/campaigns/<id>` and the workspace id to switch into.
- [ ] Build per GLB §2.1 (+ "Run daily job" and "Simulate a day" when demo-gated). "Live now" click sets `of_ws` to the campaign's workspace then navigates.
- [ ] Commit — `feat(platform): the review queue with reason codes, link checks and live now`

---

### Task 30: Advertisers list and detail

**Files:** Rewrite `src/app/admin/advertisers/{page.tsx,actions.ts}`, create `src/app/admin/advertisers/[id]/{page.tsx,actions.ts}`, `src/lib/advertisers.ts` (`advertiserRows(now)` with the GLB §2.2 columns; `advertiserDetail(id)`), `src/lib/copy-advertisers.ts`. Test: `tests/unit/advertisers.test.ts`.
- [ ] Tests: in-use and outstanding columns from `money.ts`; credit edit refuses negatives, re-renders, notifies owner, audits; "Close month" header action is Global-only and idempotent; detail lists invoices with Mark paid, open credit requests with Approve (sets limit) / Dismiss, audit trail, approve/decline/re-approve workspace.
- [ ] Commit — `feat(platform): advertisers with credit, invoices, requests and audit`

---

### Task 31: Phoenix settlement page

**Files:** Create `src/app/admin/settlement/{page.tsx,actions.ts}`, `src/lib/copy-settlement.ts`. Test: `tests/unit/settlement-page.test.ts`.
- [ ] Tests: KPIs for the selected month only; by-market rows; share edit validated and effective next statement (current month's figures unchanged until close); past statements from rows with Mark paid.
- [ ] Build per GLB §2.4. Commit — `feat(platform): settlement by month and market`

---

### Task 32: Rewards ledger page

**Files:** Create `src/app/admin/rewards/{page.tsx,actions.ts}`, `src/lib/copy-rewards-ledger.ts`. Test: `tests/unit/rewards-ledger-page.test.ts`.
- [ ] Tests: KPIs (earned = Σ payouts not blocked/rejected this month; sent; balance with "top up soon" under $500 and "about N days" otherwise; points); by-campaign rows with "Paid"/"Open" by whether the month's invoice is paid; top-up refuses ≤ 0, records `AggregatorTopup`; fraud toggles persist; held payouts list with Release/Reject.
- [ ] Build per GLB §2.5. Commit — `feat(platform): rewards ledger, aggregator top-ups, fraud rules, held rewards`

---

### Task 33: Seed v2 — the prototype's world

**Files:** Rewrite `prisma/seed.ts` and `prisma/seed/*` (`users`, `workspaces`, `campaigns`, `rates`, `money`, `events` (generator from ADV "Seed generator" with `prng`), `notifications`), update `README.md` logins. Test: `tests/unit/seed.test.ts` (rewrite).
- Exact data: spec §6.13 and ADV "Seed campaigns" (nine campaigns, descriptions verbatim, Jackpot 10 in SN), people, notifications from ADV §12, rates/FX/share/aggregator from GLB §2.7. Dates are relative to the run day (ADV offsets). Metrics are generated at each campaign's progress with events dated inside the flight; every Phoenix sharer gets a phone; payouts for sClaims; ledger delivery/reward lines are posted from the generated events, and invoices INV-0037…INV-0051 (statuses as ADV §8: paid, due, overdue, open-to-date) are built by `closeMonth` over the seeded history, so their amounts are whatever the events produce, not the prototype's figures (spec §6.14.5).
- [ ] Tests: counts (4 workspaces, 7 users, 9 campaigns, 20 rate rows, 7 invoices…); Kola's `creditSummary.inUse` within ±5 % of $702 and MediaSpec's outstanding = $3,610; SunFresh pending with the banner notification; seed is deterministic (run twice on empty DBs → same campaign impression totals).
- [ ] Commit — `feat(seed): the prototype's four workspaces, nine campaigns and their history`

---

### Task 34: End-to-end flows

**Files:** Create `tests/e2e/{create-approve.spec.ts, pause-end.spec.ts, credit.spec.ts, people.spec.ts, global.spec.ts, palette.spec.ts}`; keep `loop.spec.ts` green; `playwright.config.ts` unchanged.
- [ ] Flows: F1 (Tunde creates "Harmattan sale", Phoenix card, submits; admin approves; card shows Live); F3 (pause → Resume → End now modal → "Ended — $X released"); F4 (admin lowers Kola's limit to $100, runs the daily job, Buy 2 get 1 is paused with the notification; admin marks INV-0044-equivalent paid; resume works); F5 (invite ada2@…, copy link, open it in a fresh context, join as Manager, People shows them); Global (switch to Kola Bright via the switcher, banner text, Back to Platform); ⌘K finds "Buy 2" and opens the campaign.
- [ ] Commit — `test(e2e): the prototype's flows`

---

### Task 35: README, deploy notes, demo controls

**Files:** Modify `README.md` (logins, DEMO_CONTROLS, daily job cron line `0 2 * * * npm run job:daily`, close-month note), `package.json` (`job:daily` script), `.env.example` (`DEMO_CONTROLS`).
- [ ] Verify `npm run type-check && npm run lint && npm test` green; commit — `docs: slice 2 setup, demo controls and the daily job`

---

## Self-review notes (written with the spec open)

- Spec coverage: §6.1 → Tasks 4, 5, 29, 30; §6.2 → 3, 4, 13, 14; §6.3 → 9, 10, 11, 16; §6.4 → 29; §6.5 → 8, 22, 23, 30; §6.6 → 7, 31; §6.7 → 25, 26, 27, 28; §6.8 → 12, 18, 19, 20; §6.9 → 15, 24; §6.10 → 17; §6.11 → 1, 5, 6; §6.12 routes → the page tasks; §6.13 → 33.
- Names used consistently: `requireMember`, `creditSummary`, `currentCpmCents`, `campaignMetrics`, `onSuccessfulShare`, `runDaily`, `closeMonth`, `markInvoicePaid`, `listSwitcher`, `navFor`.
- Review Focus lines are pinned to Tasks 4, 7, 8, 12, 13, 26, 27, 28.
