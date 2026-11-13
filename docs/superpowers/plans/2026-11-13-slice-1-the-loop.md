# OshoFree Slice 1 ("the loop you can show") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One brand signs up, gets approved, runs one wall-card offer, Phoenix (or the built-in demo wall) fetches it, a consumer opens a share link on an OshoFree page, leaves details, gets their own link, and the brand sees the funnel, with every number counted by OshoFree.

**Architecture:** One Next.js app with five surfaces: advertiser console (`/app`), Global console (`/admin`), consumer landing (`/o/[code]`, rendered to static HTML by a route handler with zero client JavaScript), channel API (`/api/v1`, bearer channel key), and an env-gated demo wall (`/wall`). Postgres via Prisma holds users, workspaces, campaigns, channels, share links (a tree), consumers, and two separate event tables (channel-reported vs OshoFree-counted). All report numbers are SQL aggregates computed on read.

**Tech Stack:** Next.js 15.x (App Router, TypeScript), Tailwind CSS, shadcn/ui, Prisma 6 + Postgres 16 (Docker), Auth.js v5 (next-auth@5, Credentials + JWT), zod, react-hook-form, bcryptjs, Recharts, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-12-oshofree-slice-1-design.md`

## Global Constraints

- Next.js 15.x, TypeScript strict; Prisma pinned to major 6 (`prisma@6`, `@prisma/client@6`); `next-auth@5`.
- Ports: app on **3100**, Postgres on **5433** (Verism already holds 3000/3001/5432 on this machine). Dev DB `oshofree`, test DB `oshofree_test`, user/password `oshofree`/`oshofree`.
- Countries `NG | KE | GH | TZ | SN`; Nigeria first. Categories: `Food & drink, Personal care, Banking & fintech, Telecom & data, Betting, Travel, Retail`.
- Campaign limits: headline ≤ 48, description ≤ 240, share reward label ≤ 60, budget ≥ 50 USD, image jpg/png/webp ≤ 2 MB, link offers `https://` only; betting category or headline matching `/draw|jackpot/i` needs `/licen|approv|NLRC|BCLB|LONASE|GBT/i` in the description.
- Share-link codes: 8 chars, Crockford base32 (alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`).
- Channel API: `ttl_seconds: 900`; events batch ≤ 500; dedupe window one hour on (channel, session, campaign, type); `Idempotency-Key` header required on POST /events.
- Landing page: ≤ 61,440 bytes of HTML, no `<script>`, native forms only.
- No raw hex colour outside `src/lib/tokens.ts` (lint rule). Copy is consequence-first, one line per item, and lives in `src/lib/copy.ts`.
- Every console query is scoped by the current workspace; every admin action records a `ReviewAction`.
- Commit after every task with a conventional message. Run `npm run type-check && npm run lint && npm test` before each commit.

## Review Focus

1. A Nigerian phone typed as `0803 123 4567` or `08031234567` must become `+2348031234567`; `+44…` on an NG campaign must be refused with the form error, no Consumer row (Task 11).
2. A campaign whose `endsAt` has passed, or whose workspace is not approved, must disappear from `GET /offers` on the next poll even though its stored status is `live` (Task 2, Task 10).
3. Reloading the landing page in the same browser the same day must not add a unique open; a new UTC day must (Task 9).
4. Replaying a `POST /events` batch with the same `Idempotency-Key` must return 202 with the original counts and insert nothing (Task 10).
5. `?go=claim` on a code offer, or on an unknown or ended code, must never redirect anywhere: it renders the page or the 410 page (Task 11).

---

## File Structure

```
oshofree/
  docker-compose.yml  .env.example  .env.test  vitest.config.ts  playwright.config.ts
  .github/workflows/ci.yml  eslint.config.mjs  tsconfig.json  package.json
  prisma/schema.prisma  prisma/migrations/  prisma/seed.ts
  src/middleware.ts                      guards /app and /admin (edge-safe, no Prisma)
  src/lib/db.ts                          Prisma singleton
  src/lib/tokens.ts                      colours, radius, sidebar width, tile colours (only file with hex)
  src/lib/copy.ts                        page titles/subtitles, button labels, form errors
  src/lib/markets.ts                     COUNTRIES, MARKETS (currency, symbol, timezone, dial code), CATEGORIES
  src/lib/campaign-status.ts             effectiveStatus(), deliveringWhere()
  src/lib/auth.config.ts / auth.ts       Auth.js split config; users.ts (create/verify); session.ts (requireUser/requireAdmin)
  src/lib/workspaces.ts                  createWorkspace, workspaceForUser, requireWorkspace, setupChecklist
  src/lib/campaigns.ts                   zod schema, validateCampaign, create/update/submit/pause/resume/approve/reject
  src/lib/storage.ts                     putImage/imageUrl (local disk behind an interface)
  src/lib/links.ts                       generateCode, mint*Link, linkByCode, linkUrl, recordOpen/Claim/Details, linkStats
  src/lib/consumers.ts                   normalisePhone, upsertConsumer
  src/lib/channels.ts                    hashKey, channelFromRequest
  src/lib/events.ts                      eventsSchema, ingestEvents
  src/lib/offers.ts                      offersFor() → OfferDto[]
  src/lib/reports.ts                     campaignFunnel, campaignDaily, campaignSharing, workspaceSharing, homeNumbers, heroCampaign
  src/lib/landing/render.tsx, styles.ts, share-targets.ts   static HTML for /o/[code]
  src/app/(auth)/sign-in, sign-up        pages + actions
  src/app/api/auth/[...nextauth]/route.ts
  src/app/app/layout.tsx                 console shell
  src/app/app/page.tsx                   Campaigns home
  src/app/app/new-workspace/page.tsx
  src/app/app/campaigns/new/page.tsx, [id]/page.tsx, [id]/edit/page.tsx, actions.ts
  src/app/app/sharing/page.tsx           Growth › Sharing
  src/app/app/workspace/page.tsx, actions.ts
  src/app/admin/layout.tsx, review/page.tsx + actions.ts, advertisers/page.tsx + actions.ts, api/page.tsx
  src/app/api/v1/offers, share, events, links/[code]/stats  (route.ts each)
  src/app/api/upload/route.ts, src/app/uploads/[key]/route.ts
  src/app/o/[code]/route.tsx, claim/route.ts, details/route.ts, share/route.ts
  src/app/wall/page.tsx, WallClient.tsx, actions.ts
  src/components/console/   Sidebar, TopBar, SetupChecklist, PageHead, StatusPill, NumberTile, ImpersonationBanner
  src/components/campaign/  OfferCard, PhonePreview, CampaignForm, CampaignHero, CampaignCard, Funnel, DailyChart
  tests/setup.ts  tests/unit/*.test.ts  tests/e2e/loop.spec.ts
```

---

### Task 1: Scaffold, tokens, lint rule, CI

**Files:**
- Create: everything in the repo root listed above except Prisma, plus `src/lib/tokens.ts`, `src/lib/copy.ts` (empty object for now), `tests/unit/tokens.test.ts`

**Interfaces:**
- Produces: `tokens` object in `src/lib/tokens.ts` with keys `bg, card, line, line2, ink, ink2, ink3, accent, accentSoft, accentLine, green, greenSoft, amber, amberSoft, red, redSoft, blue, blueSoft, radius ('14px'), sidebar ('248px')` and `tileColors: readonly [7 strings]`, using the prototype's values (`#F6F7F9, #FFFFFF, #E6E8EE, #F0F1F4, #14171D, #5B6170, #9AA0AE, #FF5A1F, #FFF1EB, #FFD9C8, #0E9F6E, #E5F6EF, #B7791F, #FCF3DF, #C53030, #FDE8E8, #2B5FD9, #E9EFFC`; tiles `#FF5A1F #0F766E #2B5FD9 #7C3AED #B45309 #BE185D #111827`).
- Produces: npm scripts `dev` (`next dev -p 3100`), `build`, `start`, `type-check` (`tsc --noEmit`), `lint`, `test` (`vitest run`), `test:e2e`, `db:migrate`, `db:seed`, `db:reset`, `docker:up`.

- [ ] **Step 1: Scaffold** — `npx create-next-app@15 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`, then `npx shadcn@latest init -d` and `npx shadcn@latest add button input label select textarea checkbox dialog tabs badge card table`. Install `vitest @vitest/coverage-v8 @playwright/test zod react-hook-form @hookform/resolvers bcryptjs @types/bcryptjs recharts tsx dotenv-cli`.
- [ ] **Step 2: Write the failing test** `tests/unit/tokens.test.ts`: `expect(tokens.accent).toBe('#FF5A1F')`, `expect(tokens.tileColors).toHaveLength(7)`.
- [ ] **Step 3: Run `npm test`** — expected FAIL (module not found).
- [ ] **Step 4: Write `src/lib/tokens.ts`**, `vitest.config.ts` (`environment: 'node'`, `include: ['tests/unit/**/*.test.ts']`, `setupFiles: ['tests/setup.ts']`, `fileParallelism: false`), an empty `tests/setup.ts`, and the npm scripts.
- [ ] **Step 5: Add the lint rule** in `eslint.config.mjs`: `no-restricted-syntax` with selector `Literal[value=/#[0-9a-fA-F]{3,8}\\b/]` and message "Colours come from src/lib/tokens.ts", applied to `src/**` with `src/lib/tokens.ts` ignored. Add a throwaway `src/x.tsx` containing `'#fff'`, run `npm run lint`, expected: one error; delete the file.
- [ ] **Step 6: Infra files** — `docker-compose.yml` (postgres:16-alpine, port `5433:5432`, env from Global Constraints, named volume), `.env.example` (`DATABASE_URL=postgresql://oshofree:oshofree@localhost:5433/oshofree`, `AUTH_SECRET=`, `APP_URL=http://localhost:3100`, `UPLOAD_DIR=./uploads`, `DEMO_WALL=1`, `DEMO_CHANNEL_KEY=phx_dev_oshofree`), `.env.test` (same with db `oshofree_test`), `.github/workflows/ci.yml` (node 20, `npm ci`, `npx prisma generate`, `npm run type-check`, `npm run lint`, `npm test` against a postgres:16 service; a second job `e2e` on push to main only running `npm run test:e2e`).
- [ ] **Step 7: Run `npm run type-check && npm run lint && npm test`** — expected all PASS.
- [ ] **Step 8: Commit** `chore: scaffold Next app, tokens, lint rule, docker and CI`.

### Task 2: Schema, markets, status machine

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/db.ts`, `src/lib/markets.ts`, `src/lib/campaign-status.ts`, `tests/unit/campaign-status.test.ts`, `tests/unit/markets.test.ts`; fill `tests/setup.ts`

**Interfaces:**
- Produces: Prisma models exactly as spec 6.6 plus `ChannelBatch(id, channelId, key, accepted, deduped, ignored, receivedAt; @@unique([channelId, key]))` and `ChannelEvent.dedupeKey String` with `@@unique([channelId, dedupeKey])`. Enums: `Country`, `WorkspaceType {Brand, Agency}`, `WorkspaceStatus {pending, approved, declined}`, `Role {Owner, Manager, Viewer}`, `Placement {card, featured, video, splash}`, `RedeemMethod {code, link}`, `CampaignStatus {draft, review, live, paused, rejected}` (scheduled/ended are derived), `SharerType {Root, Channel, Consumer}`, `ShareVia {whatsapp, sms, x, copy, other}`, `LinkEventType {Open, Claim, DetailsLeft}`, `ChannelEventType {Impression, Open, Claim, Share}`, `ReviewTarget {Workspace, Campaign}`, `ReviewVerb {Approve, Reject, Decline}`.
- Produces: `COUNTRIES`, `type Country`, `MARKETS: Record<Country, {name, currency, symbol, timezone, dial}>` (NG: NGN ₦ Africa/Lagos 234; KE: KES KSh Africa/Nairobi 254; GH: GHS GH₵ Africa/Accra 233; TZ: TZS TSh Africa/Dar_es_Salaam 255; SN: XOF F Africa/Dakar 221), `CATEGORIES`.
- Produces: `type EffectiveStatus = CampaignStatus | 'scheduled' | 'ended'`; `effectiveStatus(c: {status: CampaignStatus; startsAt: Date; endsAt: Date}, now: Date): EffectiveStatus`; `deliveringWhere(now: Date): Prisma.CampaignWhereInput` = `{ status: 'live', startsAt: { lte: now }, endsAt: { gt: now }, workspace: { status: 'approved' } }`.
- Produces: `tests/setup.ts` exporting `resetDb()` (TRUNCATE all tables CASCADE) and calling it in `beforeEach`; `db` singleton.

- [ ] **Step 1: Write failing tests** — `campaign-status.test.ts`: live + startsAt tomorrow → `'scheduled'`; live + endsAt an hour ago → `'ended'`; paused + endsAt passed → `'ended'`; review → `'review'`; live inside flight → `'live'`; `deliveringWhere(now)` equals the object above. `markets.test.ts`: `MARKETS.NG.dial === 234`, `CATEGORIES.length === 7`.
- [ ] **Step 2: Run `npm test`** — expected FAIL.
- [ ] **Step 3: Write schema, `db.ts`, `markets.ts`, `campaign-status.ts`.** Run `npm run docker:up`, then `npx prisma migrate dev --name init` (dev DB) and `npx dotenv -e .env.test -- npx prisma migrate deploy` (test DB). Add `pretest` script: `dotenv -e .env.test -- prisma migrate deploy`.
- [ ] **Step 4: Run `npm test`** — expected PASS.
- [ ] **Step 5: Commit** `feat(db): schema, markets, campaign status machine`.

### Task 3: Users and sign-in

**Files:**
- Create: `src/lib/auth.config.ts`, `src/lib/auth.ts`, `src/lib/users.ts`, `src/lib/session.ts`, `src/middleware.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/(auth)/sign-up/page.tsx` + `actions.ts`, `src/app/(auth)/sign-in/page.tsx`, `tests/unit/users.test.ts`

**Interfaces:**
- Produces: `createUser({email, password, name}): Promise<User>` (lower-cases email, bcrypt cost 10, throws `'EMAIL_TAKEN'`); `verifyCredentials(email, password): Promise<User | null>`.
- Produces: `auth()` from Auth.js; session shape `{ user: { id, email, name, isGlobalAdmin } }`; `requireUser(): Promise<SessionUser>` (redirects to `/sign-in`), `requireAdmin(): Promise<SessionUser>` (404 when not admin).
- Produces: middleware matcher `['/app/:path*', '/admin/:path*']`; unauthenticated → `/sign-in?callbackUrl=…`.

- [ ] **Step 1: Write failing tests** — `createUser` then `verifyCredentials` with the right password returns the user, wrong password returns null, duplicate email throws `EMAIL_TAKEN`, email is stored lower-cased.
- [ ] **Step 2: Run `npm test`** — FAIL.
- [ ] **Step 3: Implement `users.ts`**; `auth.config.ts` (providers: [], `session: {strategy: 'jwt'}`, `callbacks.authorized` returns `!!auth`, `jwt`/`session` copy `id` and `isGlobalAdmin`); `auth.ts` = `NextAuth({...authConfig, providers: [Credentials({ authorize: verifyCredentials })]})`; middleware re-exports `auth` from `auth.config` only (no Prisma on the edge).
- [ ] **Step 4: Sign-up page** (name, work email, password; server action calls `createUser` then `signIn('credentials')` and redirects to `/app`) and sign-in page. Copy from `copy.ts`: title "Sign in to OshoFree", error "That email and password don't match."
- [ ] **Step 5: Run tests, then manually:** `npm run dev`, sign up, land on `/app` (404 for now is fine), `/admin` as non-admin → 404.
- [ ] **Step 6: Commit** `feat(auth): email and password sign-in, protected consoles`.

### Task 4: Workspaces

**Files:**
- Create: `src/lib/workspaces.ts`, `src/app/app/new-workspace/page.tsx` + `actions.ts`, `src/app/app/workspace/page.tsx` + `actions.ts`, `tests/unit/workspaces.test.ts`

**Interfaces:**
- Produces: `createWorkspace(userId, {name, type, country}): Promise<Workspace>` (status pending, creates Owner membership); `workspaceForUser(userId): Promise<Workspace | null>`; `requireWorkspace(): Promise<Workspace>` (session user's workspace; if the user is a Global admin and cookie `og_ws` is set, that workspace; no workspace → redirect `/app/new-workspace`); `updateWorkspace(id, {name, type, country})`; `setupChecklist(workspaceId): Promise<{ workspace: true; firstCampaign: boolean; approvedCampaign: boolean; firstShare: boolean }>`.

- [ ] **Step 1: Failing tests** — create sets `pending` and one `Owner` member; `workspaceForUser` finds it; `setupChecklist` on a fresh workspace is `{workspace: true, firstCampaign: false, approvedCampaign: false, firstShare: false}`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** `approvedCampaign` = any campaign with status in (live, paused); `firstShare` = any ShareLink with sharerType ≠ Root.
- [ ] **Step 4: Pages.** New workspace: name, type (Brand/Agency), billing country. Workspace page: the same three, editable. Both use `copy.ts` entries `newWorkspace` ("Create your workspace", "Global checks every new advertiser before campaigns can go live, usually within a working day.") and `workspace`.
- [ ] **Step 5: Run tests; commit** `feat(workspaces): create, settings, set-up checklist facts`.

### Task 5: Console shell

**Files:**
- Create: `src/app/app/layout.tsx`, `src/app/app/page.tsx` (placeholder heading), `src/components/console/Sidebar.tsx`, `TopBar.tsx`, `SetupChecklist.tsx`, `PageHead.tsx`, `StatusPill.tsx`, `NumberTile.tsx`, `ImpersonationBanner.tsx`; fill `src/lib/copy.ts` with `PAGE` entries for campaigns, newCampaign, sharing, workspace, review, advertisers, api (titles and subtitles from the prototype's TITLES, Phoenix wording kept)

**Interfaces:**
- Produces: `<PageHead title subtitle actions?>`, `<StatusPill status: EffectiveStatus | WorkspaceStatus>` (colours: live green, review and paused amber, rejected red, scheduled blue, ended grey, pending amber, approved green, declined red), `<NumberTile label value hint?>`, `<SetupChecklist items>`.
- Sidebar groups (spec 6.3): Campaigns → Campaigns `/app`, New campaign `/app/campaigns/new`; Growth → Sharing `/app/sharing`; Organisation → Workspace `/app/workspace`. Active item uses `tokens.accent` background. Below the nav: the checklist card with labels "Create workspace", "Add your first campaign", "Get it live on Phoenix", "Share your first link".
- Pending-workspace banner across the top: "Your workspace is waiting for Global's approval. You can draft campaigns now; they go live once both are approved."

- [ ] **Step 1: Build the shell** (server layout reads `requireWorkspace()` and `setupChecklist`). Mobile: sidebar collapses under 980px.
- [ ] **Step 2: Verify** in the browser at 1280px and 390px; `npm run lint` passes (no hex). **Step 3: Commit** `feat(console): shell, sidebar groups, set-up checklist`.

### Task 6: Campaign rules and lifecycle

**Files:**
- Create: `src/lib/campaigns.ts`, `tests/unit/campaigns.test.ts`

**Interfaces:**
- Produces: `campaignInput` (zod) with fields from spec 6.4: `name, brand, country, category, headline, description, tileColor?, creativeImageKey?, placement ('card' only accepted), redeemMethod, claimCode?, linkUrl?, budgetUsd, startsAt (ISO date), runsForDays (1..90), shareRewardLabel, termsAccepted (literal true)`; `type CampaignInput = z.infer<…>`.
- Produces: `validateCampaign(i: CampaignInput): string | null` returning the first message, in this order and wording: "Give the campaign a name." / "Which brand is this for?" / "Write the offer headline." / "Describe what the consumer gets." / "Betting and draw offers need a licence or approval number in the description." / "Online offers need an https:// link." / "Minimum budget is $50." / "Confirm the offer is genuine."
- Produces: `createCampaign(workspaceId, i): Promise<Campaign>` (status `draft`, `endsAt = startsAt + runsForDays`); `updateCampaign(id, i)` (only when draft or rejected); `submitCampaign(id)` (draft|rejected → review, sets submittedAt, clears rejectReason); `pauseCampaign(id)` (live → paused); `resumeCampaign(id)` (paused → live); each throws `'INVALID_TRANSITION'` otherwise. `approveCampaign`/`rejectCampaign` are added in Task 8.

- [ ] **Step 1: Failing tests** — one test per validation message using a valid fixture mutated one field at a time (headline of 49 chars fails the schema; 48 passes); transitions: draft → review ok; review → paused throws; live → paused → live ok.
- [ ] **Step 2: Run** FAIL. **Step 3: Implement.** **Step 4: Run** PASS. **Step 5: Commit** `feat(campaigns): input rules and lifecycle`.

### Task 7: Image upload and the campaign form

**Files:**
- Create: `src/lib/storage.ts`, `src/app/api/upload/route.ts`, `src/app/uploads/[key]/route.ts`, `src/components/campaign/OfferCard.tsx`, `src/components/campaign/CampaignForm.tsx`, `src/app/app/campaigns/new/page.tsx`, `src/app/app/campaigns/[id]/edit/page.tsx`, `src/app/app/campaigns/actions.ts`, `tests/unit/storage.test.ts`

**Interfaces:**
- Produces: `putImage(file: File): Promise<string>` (validates type and ≤ 2,097,152 bytes, throws `'BAD_IMAGE'`; key = `<uuid>.<ext>`; writes under `UPLOAD_DIR`), `imageUrl(key): string` = `/uploads/<key>`.
- Produces: `<OfferCard offer: OfferCardProps>` where `OfferCardProps = { brand, headline, description, imageUrl?: string | null, color?: string | null, rewardLabel, endsAt: Date, outlined?: boolean }`, rendering the wall card the way the prototype's `cardHtml` does (image or colour tile, brand small, headline bold, reward line).
- Produces: server actions `saveDraft(input) → {id} | {error}`, `submit(id)`, `pause(id)`, `resume(id)` wrapping Task 6 and revalidating `/app`.

- [ ] **Step 1: Failing test** — `putImage` rejects a 3 MB buffer and a `.gif`; accepts a 10 KB png and the key ends with `.png`.
- [ ] **Step 2: Run** FAIL. **Step 3: Implement storage and the two routes** (`POST /api/upload` multipart → `{key, url}`; `GET /uploads/[key]` streams the file with the right content type).
- [ ] **Step 4: Form page.** Two-column: left the form (react-hook-form + zodResolver(campaignInput)), inline errors, submit disabled until valid, placements as four option tiles with featured/video/splash disabled and labelled "Coming soon", seven colour swatches, image drop zone posting to `/api/upload`; right rail a sticky `<OfferCard>` updating on every change and a "Preview on Phoenix" button (wired in Task 13). Primary action "Submit for review" (saves then submits); secondary "Save draft".
- [ ] **Step 5: Verify** manually: create a draft, see it in the DB with status draft; submit → review. **Step 6: Commit** `feat(campaigns): form, live card preview, image upload`.

### Task 8: Global review queue

**Files:**
- Create: `src/app/admin/layout.tsx`, `src/app/admin/review/page.tsx` + `actions.ts`, `src/lib/links.ts` (codes and `mintRootLink` only; the rest in Task 9); Modify: `src/lib/campaigns.ts`, `src/lib/workspaces.ts`; Test: `tests/unit/review.test.ts`

**Interfaces:**
- Produces: `approveWorkspace(id, byUserId)`, `declineWorkspace(id, byUserId, reason)`; `approveCampaign(id, byUserId)` (review → live, decidedAt, ReviewAction, and `mintRootLink` for every Channel with `isLive`), `rejectCampaign(id, byUserId, reason)` (review → rejected). Approving a campaign whose workspace is not approved throws `'WORKSPACE_NOT_APPROVED'`.
- Produces: `generateCode(): string` (5 random bytes → 8 Crockford chars), `mintRootLink(campaignId, channelId): Promise<ShareLink>` (idempotent per pair, depth 0, sharerType Root).
- Produces: `checkLink(url: string): Promise<'ok' | 'broken'>` (HEAD, 5 s timeout, 2xx/3xx = ok).
- Admin sidebar group "Platform": Review `/admin/review`, Advertisers `/admin/advertisers`, Phoenix API `/admin/api`.

- [ ] **Step 1: Failing tests** — `generateCode()` is 8 chars from the alphabet and 1,000 calls give 1,000 distinct values; approving a campaign creates exactly one Root link per live channel and a ReviewAction; approving twice does not create a second link; approving under a pending workspace throws; rejecting stores the reason.
- [ ] **Step 2: Run** FAIL. **Step 3: Implement.**
- [ ] **Step 4: Review page.** Section "New advertisers" (pending workspaces: name, type, country, owner, Approve / Decline-with-reason). Section "Campaigns waiting" with the checklist line verbatim from spec 6.10, creative thumbnail, `checkLink` result as "Link works" / "Link is broken", licence hint "Licence ✓/✗" for betting or draw, Approve / Reject-with-reason, Preview (wired in Task 13). Empty state "Nothing waiting."
- [ ] **Step 5: Run tests; commit** `feat(admin): review queue approves workspaces and campaigns, mints root links`.

### Task 9: Share links, consumers, events on OshoFree pages

**Files:**
- Modify: `src/lib/links.ts`; Create: `src/lib/consumers.ts`, `tests/unit/links.test.ts`, `tests/unit/consumers.test.ts`

**Interfaces:**
- Produces: `mintChannelLink(campaignId, channelId, sessionId, via: ShareVia): Promise<ShareLink>` (depth 1, parent = Root); `mintConsumerLink(parentId, consumerId): Promise<ShareLink>` (depth = parent.depth + 1, via null); `setLinkVia(id, via)`; `linkByCode(code): Promise<(ShareLink & {campaign: Campaign & {workspace: Workspace}}) | null>`; `linkUrl(code): string` = `${APP_URL}/o/${code}`; `recordOpen(linkId, visitorId, ipHash, userAgent): Promise<{deduped: boolean}>` (deduped when an Open with `deduped=false` exists for the same link + visitor since 00:00 UTC today); `recordClaim(linkId, visitorId)`, `recordDetails(linkId, visitorId)`; `linkStats(code): Promise<{opens_unique, opens_all, details_left, claims, children} | null>`.
- Produces: `normalisePhone(raw: string, country: Country): string | null` (strips spaces, dashes, brackets; `0` + 10 digits → `+<dial>` + 10 digits; `<dial>…` → `+<dial>…`; `+<dial>…` kept; anything else or a different dial code → null); `upsertConsumer(phone, country, name?): Promise<Consumer>`.

- [ ] **Step 1: Failing tests** — `normalisePhone('0803 123 4567','NG') === '+2348031234567'`, `('2348031234567','NG')`, `('+2348031234567','NG')` same; `('+447700900000','NG') === null`; `('0712345678','KE') === '+254712345678'`. Links: child depth increments; `recordOpen` twice same visitor same day → second `deduped: true`; with a visitor id on a different UTC day (freeze time) → not deduped; `linkStats` counts `opens_unique` 1 and `opens_all` 2 after that, `children` = number of direct children.
- [ ] **Step 2: Run** FAIL. **Step 3: Implement.** **Step 4: Run** PASS. **Step 5: Commit** `feat(links): share-link tree, OshoFree-counted events, phone normalisation`.

### Task 10: Channel API v1

**Files:**
- Create: `src/lib/channels.ts`, `src/lib/events.ts`, `src/lib/offers.ts`, `src/app/api/v1/offers/route.ts`, `src/app/api/v1/share/route.ts`, `src/app/api/v1/events/route.ts`, `src/app/api/v1/links/[code]/stats/route.ts`, `tests/unit/channel-api.test.ts`

**Interfaces:**
- Produces: `hashKey(key): string` (sha256 hex), `channelFromRequest(req: Request): Promise<Channel | null>` (reads `Authorization: Bearer`).
- Produces: `type OfferDto = { id, placement: 'card', brand, headline, description, category, creative: {image: string | null, color: string | null}, cta: {label: string, type: 'code' | 'link', url: string | null}, share: {enabled: true, reward_label: string}, ends_at: string }`; `offersFor(country: Country, channelId: string, now: Date): Promise<OfferDto[]>` (uses `deliveringWhere`, orders by placement then startsAt; `creative.image` is an absolute URL `${APP_URL}${imageUrl(key)}`; link offers get `cta.label 'Open offer'` and `cta.url = linkUrl(rootCode) + '?go=claim'`; code offers get `cta.label = claimCode`, `cta.url null`).
- Produces: `eventsSchema` (zod: `{ channel: string, events: Array<{type, offer_id, placement?, country?, session_id, link_code?, ts}> }`, max 500); `ingestEvents(channelId, batchKey, events): Promise<{accepted, deduped, ignored, replayed: boolean}>` (`dedupeKey = ${session_id}:${offer_id}:${type}:${hourBucket}`; unknown offer ids are `ignored`; same batchKey → stored counts with `replayed: true`).
- Routes: `GET /api/v1/offers?country=` → 401 without a valid key, 400 bad country, else `{country, generated_at, ttl_seconds: 900, offers}`; `POST /api/v1/share` `{offer_id, session_id, via}` → `{code, url}` (404 unknown offer, 409 not delivering); `POST /api/v1/events` → 400 missing `Idempotency-Key`, 202 `{accepted, deduped, ignored}`; `GET /api/v1/links/{code}/stats` → stats or 404.

- [ ] **Step 1: Failing tests** (call the route handlers directly with `new Request(...)` against the test DB): no bearer → 401; a live campaign in NG appears, one in KE does not, one with `endsAt` yesterday does not, one under a pending workspace does not; a code offer's `cta.url` is null and label is the code; `POST /share` creates a depth-1 link with `via`; `POST /events` with 3 events → `accepted 3`; the same batch again → 202 with `accepted 3` and `replayed` behaviour (no new rows); two Impressions same session/offer/hour → `deduped 1`; event for an unknown offer → `ignored 1`.
- [ ] **Step 2: Run** FAIL. **Step 3: Implement.** **Step 4: Run** PASS. **Step 5: Commit** `feat(api): channel API v1 — offers, share, events, link stats`.

### Task 11: Consumer landing page

**Files:**
- Create: `src/lib/landing/render.tsx`, `src/lib/landing/styles.ts`, `src/lib/landing/share-targets.ts`, `src/app/o/[code]/route.tsx`, `src/app/o/[code]/claim/route.ts`, `src/app/o/[code]/details/route.ts`, `src/app/o/[code]/share/route.ts`, `tests/unit/landing.test.ts`

**Interfaces:**
- Produces: `type LandingView = { state: 'offer' | 'code' | 'shared' | 'ended' | 'error', code: string, brand, headline, description, imageUrl: string | null, color: string | null, rewardLabel, endsAtText, redeemMethod: 'code' | 'link', claimCode?: string, myUrl?: string, shareTargets?: {whatsapp, sms, x}, error?: string }`; `renderLanding(v: LandingView): string` (full HTML document, inline `<style>` from `styles.ts` built from `tokens`, no `<script>`).
- Produces: `shareTargets(url: string, text: string): {whatsapp, sms, x}` = `https://wa.me/?text=`, `sms:?&body=`, `https://twitter.com/intent/tweet?text=` with the encoded text + url.
- Routes: `GET /o/[code]` → sets visitor cookie `og_v` (uuid, 1 year) if missing, `recordOpen`, renders `offer` (200) or `ended` (410); with `?go=claim` on a link offer → `recordClaim` and 302 to `linkUrl`, on a code offer → ordinary render. `POST /o/[code]/claim` → `recordClaim`; code offer renders `code` state; link offer 302. `POST /o/[code]/details` (form fields `name`, `phone`) → `normalisePhone` (error re-renders `offer` with `error` "Enter a Nigerian mobile number, like 0803 123 4567."), `upsertConsumer`, `mintConsumerLink`, `recordDetails`, renders `shared` with `myUrl` and targets pointing at `/o/<newcode>/share?via=…`. `GET /o/[code]/share?via=` → `setLinkVia` then 302 to the plain target.

- [ ] **Step 1: Failing tests** — `renderLanding` of a long fixture is `< 61440` bytes and contains no `<script`; contains the reward label and a `<form method="post" action="/o/ABCDEFGH/details">`; `shareTargets` encodes the URL; route tests: unknown code → 410; `?go=claim` on a code offer → 200 with no `Location` header; `?go=claim` on a link offer → 302 to the brand URL and one Claim row; details with `+44…` → 200, no Consumer row, error text present; details with `0803…` → Consumer row, new link depth 2, response contains `/o/<newcode>/share?via=whatsapp`.
- [ ] **Step 2: Run** FAIL. **Step 3: Implement** (route handler uses `renderToStaticMarkup`, responds `text/html; charset=utf-8`). **Step 4: Run** PASS; open a seeded code in a phone-width window. **Step 5: Commit** `feat(landing): static consumer page with claim, details and share chain`.

### Task 12: Reports

**Files:**
- Create: `src/lib/reports.ts`, `tests/unit/reports.test.ts`

**Interfaces:**
- Produces: `type Funnel = { channel: string; saw; openedOnChannel; claimedOnChannel; claimedViaLink; shares; friendOpened; friendClaimed; detailsLeft }` (numbers), `campaignFunnel(campaignId): Promise<Funnel[]>` (one row per channel that has a Root link); `type DailyPoint = { day: 'YYYY-MM-DD'; impressions; linkOpens; claimsOnChannel; claimsViaLink }`, `campaignDaily(campaignId, days = 14): Promise<DailyPoint[]>` (days bucketed in the workspace country's timezone, zero-filled); `type Sharing = { shares; friendOpens; friendClaims; detailsLeft; deepestChain; viralCoefficient: number | null; byChannel: {channel; shares; friendOpens; friendClaims}[]; byMedium: {via: ShareVia | 'unknown'; shares; friendOpens; friendClaims}[] }`, `campaignSharing(campaignId)`, `workspaceSharing(workspaceId)`; `homeNumbers(campaignId, now): Promise<{impressions; impressionsToday; uniqueLinkOpens; shares; claims; daysElapsed; daysTotal}>`; `heroCampaign(workspaceId, now): Promise<Campaign | null>` (first live, else paused, else review, newest first).
- Definitions follow the table in spec 6.9 exactly: shares = ShareLink rows with sharerType ≠ Root; friend* = LinkEvent on depth ≥ 1; `claims` on Home = claimedOnChannel + claimedViaLink; viralCoefficient = friendClaims / shares, null when shares = 0.

- [ ] **Step 1: Failing tests** — build a fixture: 1 campaign, Root link, 2 channel links (via whatsapp, sms), 1 consumer link under the first; events: 10 Impression, 3 Open, 1 Claim (channel); LinkEvent: 2 Open on the whatsapp link (one deduped), 1 Claim on the consumer link, 1 DetailsLeft. Assert funnel `{saw 10, openedOnChannel 3, claimedOnChannel 1, claimedViaLink 1, shares 3, friendOpened 1, friendClaimed 1, detailsLeft 1}`; sharing `deepestChain 2`, `viralCoefficient 1/3`, `byMedium` whatsapp `{shares 1, friendOpens 1}`; `campaignDaily` returns 14 points and the sum of impressions is 10; `heroCampaign` prefers live over paused over review.
- [ ] **Step 2: Run** FAIL. **Step 3: Implement** with Prisma `groupBy` where it fits and `$queryRaw` for the day buckets (`date_trunc('day', "at" AT TIME ZONE $tz)`). **Step 4: Run** PASS. **Step 5: Commit** `feat(reports): funnel, daily series, sharing, home numbers`.

### Task 13: Campaigns home and campaign page

**Files:**
- Create: `src/components/campaign/CampaignHero.tsx`, `CampaignCard.tsx`, `Funnel.tsx`, `DailyChart.tsx` (client, Recharts), `PhonePreview.tsx` (client dialog); Modify: `src/app/app/page.tsx`; Create: `src/app/app/campaigns/[id]/page.tsx`; wire "Preview on Phoenix" in Task 7's form and Task 8's review page

**Interfaces:**
- Consumes: Task 12 functions; `offersFor` for the preview; `pause`/`resume` actions.
- Produces: `<PhonePreview offers: OfferDto[] mine: OfferCardProps & {id?: string}>` (phone frame, the "More → Offers" grid, mine outlined with `tokens.accent`, copy from spec's modal: "Your card, outlined, among the offers live in this country right now.").

- [ ] **Step 1: Home.** `heroCampaign` → `<CampaignHero>` with status pill, four `<NumberTile>` (Impressions with hint "n today", Unique link opens, Shares, Claims), pace line "Day {daysElapsed} of {daysTotal}", Pause/Resume, "Open campaign". Filter pills All / Live / In review / Paused / Ended with counts; `<CampaignCard>` grid; dashed "New campaign" card. Empty state: "No campaigns yet. Your first one takes about five minutes." with the New campaign button.
- [ ] **Step 2: Campaign page.** Header: name, brand, pill, actions (Pause/Resume when live/paused; Edit and resubmit when rejected with the reason shown; Preview on Phoenix). Sections: `<DailyChart>` (14 days: impressions, link opens, claims stacked by source), `<Funnel>` per channel (six bars, labels "Saw on Phoenix", "Opened on Phoenix", "Claimed", "Shared", "Friend opened via link", "Friend claimed via link"), Sharing (`campaignSharing`: the five numbers, by channel, by medium).
- [ ] **Step 3: Verify** with seeded data (Task 17 lands later; for now create a campaign and post events through the API with curl) at 1280px and 390px; lint passes. **Step 4: Commit** `feat(console): campaigns home, campaign report, Phoenix preview`.

### Task 14: Growth › Sharing page

**Files:**
- Create: `src/app/app/sharing/page.tsx`

- [ ] **Step 1: Build** from `workspaceSharing`: five `<NumberTile>`s, "By channel" and "Shared via" tables, and a list of campaigns with their shares and friend claims linking to each campaign page. Subtitle from `copy.ts` (prototype's sharing text). Empty state: "No shares yet. Shares start when your first campaign goes live on Phoenix."
- [ ] **Step 2: Verify; commit** `feat(console): workspace sharing page`.

### Task 15: Advertisers, Open workspace, API docs

**Files:**
- Create: `src/app/admin/advertisers/page.tsx` + `actions.ts`, `src/app/admin/api/page.tsx`; Modify: `src/components/console/ImpersonationBanner.tsx`, `src/lib/workspaces.ts` (cookie read already in `requireWorkspace`)

**Interfaces:**
- Produces: actions `openWorkspace(id)` (admin only; sets cookie `og_ws`, redirects `/app`) and `exitWorkspace()` (clears it, redirects `/admin/advertisers`).

- [ ] **Step 1: Advertisers page**: table name, type, country, status pill, campaigns count, "Open workspace". Banner in the console shell when `og_ws` is set: "You are viewing {name} as Global." with Exit.
- [ ] **Step 2: API docs page**: the four endpoints from spec 6.7 with request/response examples (use the prototype's example JSON with `share.url` removed and `POST /share` added), the dedupe and viewability rules, and in non-production a box "Development key: {DEMO_CHANNEL_KEY}".
- [ ] **Step 3: Verify; commit** `feat(admin): advertisers list, open workspace, Phoenix API docs`.

### Task 16: Demo wall

**Files:**
- Create: `src/app/wall/page.tsx`, `src/app/wall/WallClient.tsx`, `src/app/wall/actions.ts`

**Interfaces:**
- Produces: server actions `wallImpressions(ids: string[])`, `wallOpen(id)`, `wallShare(id, via): Promise<{url}>`, `wallClaim(id)`; each `fetch`es the v1 API at `APP_URL` with `Authorization: Bearer ${DEMO_CHANNEL_KEY}` and `session_id` from cookie `wall_session` (uuid, set by the page), `Idempotency-Key` a fresh uuid.

- [ ] **Step 1: Build.** Page returns `notFound()` unless `DEMO_WALL === '1'`; fetches `GET /api/v1/offers?country=NG` (query param `country` overrides) server-side; renders a phone frame titled "Offers" with the cards; `WallClient` posts impressions on mount, Open on tap (card expands: description, reward, CTA, Share), Share shows the minted URL with a copy field, Claim shows the code or opens `cta.url` in a new tab.
- [ ] **Step 2: Verify** the chain by hand: wall → share → open the URL in a private window → Show my code → leave details → report shows 1 share, 1 friend open, 1 friend claim, 1 details left. **Step 3: Commit** `feat(wall): env-gated demo wall exercising the channel API`.

### Task 17: Seed

**Files:**
- Create: `prisma/seed.ts`; Modify: `package.json` (`"prisma": {"seed": "tsx prisma/seed.ts"}`, `db:reset` = `prisma migrate reset --force`)

- [ ] **Step 1: Write the seed** per spec 6.14: admin `admin@oshofree.demo` (isGlobalAdmin), workspace "Kola Bright" (Brand, NG, approved) with owner `tunde@kolabright.demo`, pending "Zuri Foods" with owner `ada@zurifoods.demo`; channels phoenix (live, key hash of `DEMO_CHANNEL_KEY`) and boomplay (not live); campaigns "Buy 2 get 1" (live, code `KOLA2X1`, started 7 days ago, 21-day flight), "Weekend cashback" (review), "December draw teaser" (live but starts in 10 days → scheduled), "August multipack" (ended 3 weeks ago); 14 days of ChannelEvents for the live campaign (80–140 impressions a day, 3–5% opens, a few claims); a share chain: Root → 3 channel links (whatsapp, whatsapp, sms) → 2 consumer links under the first → 1 under one of those (depth 3), with opens, 2 DetailsLeft and 2 Claims on depth ≥ 1. All passwords `password`. Print the dev key and the three logins at the end.
- [ ] **Step 2: Run** `npm run db:reset` then `npm run dev`; sign in as Tunde: home hero shows "Buy 2 get 1" with non-zero numbers; Sharing shows deepest chain 3; admin Review shows Zuri Foods and Weekend cashback. **Step 3: Commit** `chore(seed): demo data for the loop`.

### Task 18: End-to-end loop test and CI e2e job

**Files:**
- Create: `playwright.config.ts` (baseURL `http://localhost:3100`, `webServer: { command: 'npm run dev:test', env from .env.test, DEMO_WALL=1 }`, one project chromium), `tests/e2e/loop.spec.ts`; Modify: `package.json` (`dev:test` = `dotenv -e .env.test -- next dev -p 3100`, `test:e2e` = `dotenv -e .env.test -- prisma migrate reset --force && playwright test`)

- [ ] **Step 1: Write the test** as one spec with steps: (1) sign up as `new@brand.demo`, create workspace "Brand Demo" NG, see the pending banner; (2) in a second context sign in as the seeded admin, approve "Brand Demo"; (3) as the brand, create campaign "E2E offer" (code `E2E123`), submit; (4) admin approves it; (5) open `/wall`, expect the "E2E offer" card, tap it, tap Share via WhatsApp, read the minted URL; (6) in a third context open that URL, expect the headline, click "Show my code", expect `E2E123`, fill phone `0803 123 4567`, submit, expect a new `/o/` URL on the page; (7) as the brand, open the campaign page and expect Shares 1, Friend opened 1, Friend claimed 1, Details left 1; expect `/o/NOPE0000` → 410.
- [ ] **Step 2: Run `npm run test:e2e`** — PASS. **Step 3: Enable the `e2e` job** in `ci.yml` (main only). **Step 4: Commit** `test(e2e): the loop you can show, end to end`.

---

## Self-review notes

- Spec coverage: 6.1 (T1), 6.2 (T3, T5, T8, T10, T11, T16), 6.3 (T5, T8), 6.4 (T6, T7), 6.5 (T2, T6, T8), 6.6 (T2, T9), 6.7 (T10, T15), 6.8 (T11), 6.9 (T12, T13, T14), 6.10 (T8, T15), 6.11 (T16), 6.12 (T1, T5), 6.13 (T1), 6.14 (T17). Spec 6.4's seven swatches, four placement tiles and licence rule are in T6/T7; the pending-workspace banner in T5.
- Deviation from spec 6.8, recorded here: the landing page's CSS is an inline string built from `tokens` (`styles.ts`) rather than Tailwind classes, because Tailwind's compiled stylesheet cannot be scoped to one static page within the 60 KB budget. Tailwind still styles the consoles.
- Addition to spec 6.6, recorded here: `ChannelBatch` and `ChannelEvent.dedupeKey` implement 6.7's idempotency and dedupe rules.
- Names used across tasks were checked: `effectiveStatus`, `deliveringWhere`, `requireWorkspace`, `setupChecklist`, `validateCampaign`, `approveCampaign`, `mintRootLink`, `mintChannelLink`, `mintConsumerLink`, `recordOpen`, `linkStats`, `normalisePhone`, `offersFor`, `ingestEvents`, `renderLanding`, `campaignFunnel`, `campaignDaily`, `campaignSharing`, `workspaceSharing`, `homeNumbers`, `heroCampaign`, `OfferDto`, `OfferCardProps`.
