# OshoFree — the whole flow, audited (23 Nov 2026)

What the platform is, every address it serves, who reaches each one, and the journeys people and systems take
through them, as the code stands at commit 1330c01 on `slice-2-the-prototype`. Where a step is a product call still
open, it is marked **open**.

## 1. Who is in the system

| Actor | How they arrive | What they are for |
|---|---|---|
| **Visitor** | `/` → `/sign-in` | Not yet an account. |
| **Owner** | Signs up and creates a workspace, or is invited as Owner | Runs the advertiser: campaigns, billing, people, settings. |
| **Manager** | Invited | Creates, submits, edits and pauses campaigns; sees reports. |
| **Viewer** | Invited | Reads reports and invoices. No controls that change anything. |
| **Global** | `User.isGlobalAdmin` (bootstrap or seed) | The platform: approves advertisers and campaigns, sets credit and rates, settles Phoenix, pays rewards. |
| **Phoenix** | Channel API key (`Authorization: Bearer phx_…`) | Pulls live offers, reports what consumers did, mints share links. |
| **Consumer** | A Phoenix user on the Offers wall | Sees the card, opens it, claims, shares. |
| **Friend** | Opens a consumer's share link | Claims on the landing page; may take a link of their own. |

Capabilities (`src/lib/capabilities.ts`): `view` and `billing` are everyone's; `campaigns` and `rewards` are Owner,
Manager and Global; `people`, `settings` and `requestCredit` are Owner and Global only. The sidebar is built from the
same table, so nobody sees a link they cannot open.

## 2. The address map (HTML flow)

Every route under `/app` and `/admin` is behind Auth.js middleware (`src/middleware.ts`); a signed-out visitor is sent
to `/sign-in` with the address to come back to. Inside the console, `requireMember(capability)` decides the active
workspace from the `of_ws` cookie (ignored if the user is not in that workspace) and refuses with FORBIDDEN when the
role lacks the capability. Global is decided from the database on every request, never from the session token.

### 2.1 Onboarding (no shell; the brand lockup over one white card)

| Address | Who | What happens | Leads to |
|---|---|---|---|
| `/` | anyone | Redirects. | `/app` (signed in) or `/sign-in` |
| `/sign-in` | anyone | Email + password. `?invite=` names the workspace and role being joined and starts the email at the invited address; a dead invite shows "no longer valid" with a way on without it. | Owner/Manager/Viewer → `/app`; Global → `/admin/review`; with an invite → `/app?joined=` |
| `/sign-up` | anyone | Name, work email, password (8+). Same invite behaviour. Says nothing of a workspace: an invitee joins one. | `/app` (then on to New workspace) or `/app?joined=` |
| `/invite/[token]` | anyone with the link | Who invited you, to which workspace, as what. Signed out: Create an account / Sign in (both carry the link). Signed in: "Accept as {you}" or "Sign in as someone else". Already a member: "Open {workspace}" instead. | `/sign-up?invite=`, `/sign-in?invite=`, or `/app?joined=` |
| `/app/new-workspace` | a signed-in user with no workspace | Create your workspace: name, Brand/Agency, billing country. Sign out is the only other control. | `/app` under the "Awaiting approval" banner |

### 2.2 The workspace console (`/app`, shell with sidebar, top bar, banner)

Sidebar groups, in order: **Campaigns** (Campaigns, New campaign†) · **Growth** (Sharing, Rewards) · **Money**
(Billing & credit, Invoices) · **Organisation** (Workspace, People, Notifications). † not for Viewers.

| Address | Who | What it is | Head control |
|---|---|---|---|
| `/app` | all | Campaigns home: greeting, filter pills (All/Live/In review/Paused/Ended, plus Scheduled/Rejected when any), the hero campaign, the grid, the browser-kept draft card, the dashed New campaign tile; empty state offers the first offer and, for Owners, "Invite your team". `?joined=` toasts whom you joined as, once. | + New campaign (Owner/Manager/Global) |
| `/app/campaigns/new` | Owner/Manager/Global | One form: name, brand, country, category, tile colour, headline, description (licence number lives here for betting/draws), placement (Wall card / Featured tile / Video / Splash), creative (image ≤2 MB, splash ≤4 MB, MP4 ≤25 MB), redeem (link or code), budget, run length, start date, share reward; live card preview, cost panel; Review before submitting; Save draft (this browser only); See it on Phoenix (preview). | Campaigns (back) |
| `/app/campaigns/[id]` | all | The campaign: KPIs, impressions per day, funnel, Sharing (shares, friends opened/claimed, rewards paid, channels, top sharers), Recent activity (every event, newest first, paged), the offer, History; Change without review (money and timing, applied within 15 minutes); Edit offer and resubmit; Pause/Resume; End campaign now (asks first). | Pause/Resume · See it on Phoenix · ← Campaigns |
| `/app/campaigns/[id]/edit` | Owner/Manager/Global | The New campaign form over a running campaign: any offer change becomes a revision that waits for Global while the current version keeps running. | Campaigns (back) |
| `/app/sharing` | all | Across campaigns: shares, friends opened and claimed, rewards paid; how a share works; where people share; by campaign; every sharer (opens to their chain); points issued. | — |
| `/app/rewards` | all (edit: Owner/Manager/Global) | Airtime per successful share per campaign (editable inline), paid so far and cap; the workspace caps (per sharer per day, % of budget, points per share); how delivery works. | — |
| `/app/billing` | all (Request credit: Owner/Global) | Credit limit, in use, available, unbilled; this month's statement by campaign; account manager; Request credit (Owner/Global). | — |
| `/app/invoices` | all | Monthly invoices (number, period, status, due, USD, local), the running month; PDF opens the print page. | — |
| `/app/invoices/[id]/print` | all | The invoice as a page to print (no shell). | Print |
| `/app/workspace` | all (save: Owner/Global) | Identity card (tile, name, kind, approval) over facts (credit limit, channels, since, registration); Details (name; type and country, locked once approved; registration number); an agency's client brands with + Add client brand. | — |
| `/app/people` | all (manage: Owner/Global) | Members with count (role select, Remove; the last Owner is locked), Open invites with count (Resend retires the old link; Revoke), what each role can do. | Invite user (Owner/Global) |
| `/app/people/invite` | Owner/Global (others → People) | Email + role → Send invite; the pending invite with its link shown once, Copy, Resend, Revoke; Invite another / Back to People. | People (back) |
| `/app/notifications` | all (toggles: Owner/Global) | Five email-and-in-app toggles; Recent (the bell's items). | — |

Global inside any workspace: the same console, the same sidebar (no Platform group), the banner "Platform — you are
acting as Global inside {workspace}" with **Back to Platform**, avatar GL, Global's own bell. Every Global action is
audited.

### 2.3 Platform (`/admin`, Global only; the sidebar is the PLATFORM group alone)

| Address | What it is | Actions |
|---|---|---|
| `/admin/review` | Live on Phoenix, impressions, charged for delivery, owed to Phoenix; **New advertisers** (approve / decline with reason); **Campaigns waiting** (approve / reject with code and note / preview; revisions likewise); **Live now** cards (open inside the workspace). | Simulate a day · Run daily job (demo controls, `DEMO_CONTROLS=1`) |
| `/admin/advertisers` | Every workspace: type, country, status, campaigns, credit limit (editable), in use, outstanding; Open workspace. | Close month (issues invoices) |
| `/admin/advertisers/[id]` | One workspace: facts, account manager, campaigns, invoices (Mark paid), the audit trail, re-approve a declined one. | Enter workspace |
| `/admin/rates` | CPM per placement per country, FX per country, share rate. | Save |
| `/admin/settlement` | What Phoenix is owed per month: delivered, charged, Global's share, rewards. | — |
| `/admin/rewards` | The rewards ledger: every payout (held / paid / blocked) with its line on the campaign; aggregator balance. | Top up (own page) |
| `/admin/rewards/top-up` | Top up the airtime aggregator. | Top up |
| `/admin/api` | The Phoenix channel key (rotate, shown once), the endpoints, example calls. | Rotate key (asks first) |

### 2.4 Consumer pages (public, no session)

| Address | Who | What happens |
|---|---|---|
| `/o/[code]` | a Phoenix user or a friend | The landing page for a share link or the campaign's root link: brand, headline, description, ends date; "Show my code" / "Open offer"; "Share and earn". `?go=claim` on the root link is Phoenix's click-through for link offers (a Claim, no sharer to pay). |
| `/o/[code]/claim` | same | Records the claim (one per visitor per offer per UTC day on the link's channel); a code offer shows the visitor's code; a link offer hands them to the brand. On a sharer's link this is what earns the reward. |
| `/o/[code]/details` | same | Share and earn: leaves a mobile number, gets a link of their own one level down; asking again returns the same link. |
| `/o/[code]/share` | same | The WhatsApp / SMS / X buttons: stores the medium on the link, then hands off. |
| `/o/preview`, `/o/preview/*` | the console's preview frame | Render only; every action answers 403 and writes nothing. |
| `/uploads/[key]` | anyone | Creatives (images, MP4 with Range) — public on purpose: the wall and the landing page load them without a session. |
| `/wall` | anyone (only with `DEMO_WALL=1`) | Stands in for the Phoenix Offers wall during demos: shows live offers for a country, every tap is a real event. Off unless the variable is exactly `1`. |

### 2.5 Machine routes

| Address | Caller | What it does |
|---|---|---|
| `GET /api/v1/offers?country=` | Phoenix (channel key) | The live offers for a country as cards (placement, creative, root link). Paused and ended campaigns drop out; Phoenix has 15 minutes to stop showing them. |
| `POST /api/v1/events` | Phoenix | Impressions, opens, clicks — billed as delivered (**open**: late impressions after pause/end are still billed). |
| `POST /api/v1/share` | Phoenix | Mints a sharer's link for a Phoenix user (device + phone), tied to the campaign. |
| `GET /api/v1/links/[code]/stats` | Phoenix | A sharer's own numbers: opens, claims, reward earned. |
| `POST /api/v1/claims` | Phoenix | A claim made on Phoenix itself (code offers). |
| `POST /api/upload` | the console (signed in) | Stores a creative; size and type checked by bytes; brand check on the file. |
| `/api/auth/*` | Auth.js | Credentials sign-in, session, sign-out. |

## 3. The journeys

### J1 — A new advertiser, from nothing to paid

1. `/sign-up`: name, work email, password → lands on `/app` → no workspace → `/app/new-workspace`.
2. Create your workspace (name, Brand/Agency, billing country) → `/app` under **Awaiting approval**. The home is
   empty: the New campaign tile, "Nothing on Phoenix yet", and for the Owner **Invite your team**.
3. Builds the first campaign (`/app/campaigns/new`) → **Review before submitting** → Submit → status `review`.
   Campaigns can be built now; nothing goes live until both the workspace and the campaign are approved.
4. Global, on `/admin/review`: approves the workspace (becomes its account manager unless one is named) and approves
   the campaign → `live` from its start date (`scheduled` if later). The Owner's bell and Notifications say so; the
   banner is gone on the next page load.
5. Phoenix pulls the offer (`GET /api/v1/offers`) and reports impressions and opens; consumers share (J4); the
   campaign page and Sharing fill; the daily job charges each market day's delivery against the credit limit.
6. Credit: campaigns pause at the limit; Billing shows in use / available; the Owner can **Request credit**;
   Global sets the limit on Advertisers.
7. Month close (Global, Advertisers › Close month, or the daily job on the 1st): the month's charges become an
   invoice in the workspace's currency, due in `termsDays`; Invoices lists it, PDF prints it; due-in-5 and overdue
   notices go out; Global marks it paid on the advertiser's page.

### J2 — A team member joins

1. Owner, `/app/people` → **Invite user** → email + role → Send invite → the link appears once; Copy and pass it on.
2. Invitee opens `/invite/[token]`: Create an account or Sign in (the link rides along) → lands on `/app?joined=`
   with the toast "You've joined {workspace} as {role}".
3. What they see follows the role: a Manager has New campaign but no Invite user; a Viewer has neither and no control
   that changes anything. The Owner can change a role or Remove on People; a removed member's next page load is New
   workspace (or their other workspace).
4. Resend retires the old link; a retired, revoked, accepted or expired link says "no longer valid" everywhere.

### J3 — A campaign's life

`draft` (this browser only) → `review` → `scheduled` → `live` ⇄ `paused` → `ended` (by date, by budget, or "End campaign
now"); `review` → `rejected` (code + note) → Edit offer and resubmit → `review`.
While live: **Change without review** (budget, end date, share reward: applied within 15 minutes) or **Edit offer and
resubmit** (a revision Global approves or rejects while the current version keeps running). Pause takes it off Phoenix
within 15 minutes; Resume puts it back (refused at the credit limit). Ending releases the unspent budget.

### J4 — The consumer and the sharer

1. A consumer sees the card on the wall (impression), opens it (open), clicks through or claims.
2. Share: Phoenix mints the consumer's link (`POST /api/v1/share`); they send it by WhatsApp, SMS or X.
3. A friend opens `/o/[code]` → claims (`/o/[code]/claim`): the sharer earns the campaign's airtime (held until the
   daily job pays it through the aggregator, blocked by the caps: per sharer per day, % of budget) plus points.
4. The friend can **Share and earn** too (`/o/[code]/details`): a link of their own, one level down; the chain shows
   under the sharer on Sharing and on the campaign's Recent activity; Global's Rewards ledger shows each payout.
   **Open**: a sharer claiming their own link in a browser can be paid up to the daily cap.

### J5 — Global's day

`/admin/review` (decide advertisers, campaigns, revisions; watch Live now) → `/admin/advertisers` (credit limits,
Open workspace to act as the Owner, Close month) → `/admin/rates` (CPM, FX, share) → `/admin/settlement` (what
Phoenix is owed) → `/admin/rewards` (payouts; Top up) → `/admin/api` (the channel key). The daily job
(`npm run job:daily`, cron at 02:00) charges the previous market day, moves campaigns and payouts, closes the month on
the 1st and sends the invoice notices; Review's **Run daily job** is the same run.

## 4. Audit — what holds and what is open

**Holds (verified this week):**
- Every sidebar item opens for every role; nothing blank; browser back works (nav sweep, 87 pages / 142 presses, 0
  dead ends).
- The access matrix (role × page × action) is pinned by a unit test; Global is decided from the database.
- Invite links are shown once, never in a toast or a log; a retired link can never be accepted.
- Global inside a workspace sees the workspace's own sidebar; the banner leads back (changed 17 Nov).
- One control system across the console and onboarding (changed 17 Nov).
- The three-person journey (Owner → Member → Advertiser → Phoenix → friend) runs end to end as a Playwright spec.

**Open product calls (yours):**
1. A Phoenix sharer claiming their own link in a browser can be paid, up to the daily cap.
2. Impressions Phoenix reports after a pause or end are billed as delivered.
3. A real ₦50 payout shows as "$0" on the whole-dollar rewards ledger.
4. Drafts live in the browser, not the account (the prototype's choice).
5. Notification toggles do not filter the bell (the prototype's choice).
6. Component tests need jsdom, which the permission system declined; behaviour is pinned by logic tests and the
   browser flows.

**Rough edges seen in this audit (small):**
- The "Invite" card title on the invite page repeats the page title.
- The Rewards page's caps Save has no toast of what changed.
- `/wall` is a demo stand-in; the real Phoenix wall is outside this codebase.
