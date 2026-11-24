# OshoFree — post end-to-end critical process audit (24 Nov 2026)

Branch `staging` at commit 07db312. Nothing in the product was changed by this audit. Findings are ordered by
business impact inside each band. Each one is tagged **Confirmed defect** (reproduced by running code),
**Potential risk** (the code path is unambiguous but the trigger was not or could not be produced) or
**Untested assumption**. The six open product calls in `2026-11-23-oshofree-flow-audit.md` are not re-argued; where
this audit found new evidence about their cost it says so.

## How the audit was done

- **Baseline suite, run once at 07db312:** type-check and lint clean; 1,299 unit tests in 81 files pass; the
  production build succeeds; all 19 Playwright flows pass. These prove the happy paths the suite covers, nothing more.
- **Five investigations ran in parallel**, each in its own migrated and seeded copy of the database, calling the
  real library functions and route handlers (never re-implementations) with chosen inputs and comparing every number
  with a hand calculation: Advertiser (A), Consumer and sharer (B), Global administrator (C), Platform and system (D),
  and one campaign traced from registration to settlement (E). Their scripts, verbatim outputs and full reports are on
  this machine under `.superpowers/audit/{a,b,c,d,e}/` (git-ignored). Every "How to reproduce" below names the script.
- **The end-to-end trace (E):** a new advertiser → approval → a $200 Wall-card campaign in Nigeria → 12,345 and
  7,890 impressions on two days through `POST /api/v1/events` → a sharer, three friends, a chain two deep → two daily
  runs → month close → settlement → invoice marked paid → day-1 batch replayed. 153 checks, 152 matched the hand
  computation; the one mismatch is Important #1 below.
- **Independent verification by the controller:** the cited source lines of the six headline findings were read and
  agree with the auditors; the critical finding's script was re-run from scratch and reproduced.

---

## Critical — must fix before real customers use the platform

### C1. One person with a browser can take a campaign's entire reward budget in under a second
Status: **Confirmed defect** (reproduced twice: `b/fraud-ring.mts`, 579 ms and 544 ms).
What is wrong: the landing page's "Share and earn" form accepts any phone number with no OTP and mints a sharer; the
only identity is the `og_v` cookie, minted fresh whenever absent; the stored IP hash and user agent are never read by
the fraud check; there is no rate limit anywhere; the `phone_reuse` rule only fires when the *claiming* browser has
left a number. So one actor, one IP, four invented numbers, fresh cookies: 24 claims → 20 payouts queued = the whole
20 %-of-budget cap, 4 more held only by the per-sharer daily cap.
Why it matters: loss per campaign = `budget × rewardCapPct` (seed: $30–$160), paid out of the aggregator balance for
airtime sent to numbers nobody verified, and charged to the advertiser. This is new evidence on open product call 1:
the exposure is not "up to the daily cap per sharer" but the campaign's whole reward cap per actor.
Where: `src/lib/fraud.ts:97-99` (evaluate reads neither `ipHash` nor user agent), `src/lib/landing/visitor.ts:47-57`,
`src/app/o/[code]/details/route.ts:19-22`, `src/lib/link-events.ts:57-78`.
How to reproduce: `env DATABASE_URL=…audit_b npx dotenv -e .env.test -- tsx .superpowers/audit/b/fraud-ring.mts`.
Evidence: "24 claims from one IP in 544 ms → queued: 20 = 2000c | held/cap_per_sharer: 4 = 400c"; "distinct ipHash
among the Claim rows: 1"; "advertiser charged (ledger): −2000 c of a 2000c cap".
Recommended fix: until OTP exists on the landing page, *hold* (not queue) payouts to landing-page sharers so Global
releases them, as `no_phone` already does for Phoenix sharers; add `ipHash` to the same-device check and a
per-IP-per-campaign daily ceiling in `evaluate`; rate-limit `/o/[code]/claim` and `/o/[code]/details` per IP.
How we will know it is fixed: re-run `fraud-ring.mts`: 0 queued, 24 held (or 4 queued under a one-sharer-per-IP-per-day
ceiling), ledger charge 0 until Global releases; a unit test in `fraud.test.ts` for the IP rule.

### C2. Delivery that arrives late, or on a day the cron missed, is counted but never billed
Status: **Confirmed defect** (late impressions, `c/c1-charge.mts` §5 and `d/03-daily-job.mts` §1–3) ·
**Potential risk** (a missed cron day; mapping reproduced in `d/03-daily-job.mts` §7, outage not simulated).
What is wrong: each run charges exactly one market day, the one containing now − 24 h, and a second run for the same
key is skipped by the `JobRun` guard. Impressions whose `ts` falls in a day already charged (an SDK retry, an offline
device flushing, a batch posted after 02:00 UTC with yesterday's timestamp) are stored, shown in the campaign KPIs,
the chart and the settlement impression column, and never charged by any later cron run. Only a manual replay
(`npm run job:daily -- YYYY-MM-DD`, or Review's button, which replays yesterday only) raises the line. If the cron host
is down at 02:00 UTC, that market day for every campaign is never charged unless an operator replays it by hand. The
`JobRun` key is the UTC date of now − 24 h but the day charged is read per market, so a run delayed past ~21 h skips a
Nairobi day. The run's summary (with `errors[]`) goes to stdout and is kept nowhere.
Why it matters: silent revenue leakage, and Phoenix's share of it is never settled; the advertiser's page and the
invoice disagree with no signal to anyone. Open product call 2 ("late impressions are billed") is, in practice, not
what happens after the day's run. A missed day is a whole day of every live campaign given away.
Where: `src/lib/jobs/daily.ts:53-55` (`previousMarketDay`), `:79-82` (guard), `:119-153` (`chargeDelivery`);
`scripts/daily.ts:13-32`; `src/lib/events.ts:109`; `prisma/schema.prisma` `JobRun` (no summary column).
How to reproduce: `c/c1-charge.mts` §5; `d/03-daily-job.mts` §1–3, §5, §7.
Evidence: 10 impressions dated 22 Nov inserted after 22 Nov was charged: `lineBefore −397, afterNextDaysCron −397`;
only `runDaily(22 Nov, replay)` moved it to −399 (hand: 1,814 × 220 / 1000 = 399.08). Supa10's 23 Nov line stayed
−781 while the day held 3,788 impressions (hand 1,061); replay raised it. `run at 02:00Z → key 11-23 charges KE 11-23;
run at 22:00Z → same key charges KE 11-24`. `audit rows for the system actor from these runs: 0`.
Recommended fix: make every run iterate from the last `daily` `JobRun` day to yesterday through the existing idempotent,
raise-only `chargeDay` (also re-checking the previous 2–3 days), key runs by the market day charged, persist the
summary on `JobRun` and alert when `errors.length > 0` or a day is missing. Alternatively refuse events whose `ts` is
before the campaign's last charged day and tell Phoenix in the 202 body.
How we will know it is fixed: `daily-job.test.ts`: impressions dated D arrive after D was charged → the next plain
`runDaily` raises D's line; a run after a skipped day charges both days; `JobRun` rows carry the summary.

---

## Important — should fix before scaling

### I1. A ₦100 airtime reward is billed to the advertiser as ₦93 and the aggregator is debited 6 cents
Status: **Confirmed defect** (A1, B6, E3; the one mismatch in the 153-check trace).
What is wrong: a reward is converted once to whole US cents per payout (`rewardCents`: ₦100 ÷ 1550 × 100 = 6.45 → 6c;
₦50 → 3c) and every later figure derives from those cents: the ledger line, the invoice line printed back in local
currency, the %-of-budget cap check and the aggregator balance. Only the campaign page's Sharing card prints the stored
`amountLocal`.
Why it matters: NGN advertisers are under-billed ~7 % per reward (45 × ₦50 = ₦2,250 of airtime billed as ₦2,092.50;
each statement row prints "−₦47" for a ₦50 reward); KE rewards are over-billed ~3 %; the aggregator balance drifts
from what Reloadly will actually spend; the $40 cap admits ₦66,600 of airtime (~$43). The campaign page says "₦300
airtime" while the invoice lists 3 × ₦93. The cost panel's reward estimate (exact fraction) is ~7 % above what is
charged.
Where: `src/lib/rewards.ts:38-41` (`rewardCents`), `:48-57` (`chargeFor`), `:204` (balance); `src/lib/format.ts:51`
(`loc`); `src/app/app/(console)/invoices/[id]/print/page.tsx:37,54`; `src/lib/fraud.ts:45-49`; `src/lib/estimate.ts:36`.
How to reproduce: `e/run.sh 01-trace.mts` (row "a ₦100 airtime reward line prints as"); `a/09-campaign-numbers.mts`;
`b/extra-checks.mts` §14.
Evidence: trace: ₦100 → 6c → ₦96 at FX 1600 (₦93 at 1550). Seed: "Buy 2 get 1 — November: 45 payouts, local 2250,
stored 135c, exact 145.16c, drift −7.0 %"; "Supa10 Kenya: 91 payouts, local 910, stored 728c, exact 705.43c, +3.2 %".
Recommended fix: keep the obligation in local units: store `amountLocal` on the reward ledger line, print reward lines
from it, make the invoice's local total Σ(delivery local) + Σ(amountLocal); carry cents as a decimal (or ×100) for
the cap and the aggregator, or hold the aggregator per market in local currency. Which side absorbs the rounding is a
product call; the invoice should not say ₦93 for ₦100 of airtime.
How we will know it is fixed: `money.test.ts`: 45 payouts of ₦50 at 1550 invoice to ₦2,250 ±₦1; a statement row
reads −₦50; the trace row matches; `estimate.test.ts` pins reward estimate = shares × charged amount.

### I2. Reusing an Idempotency-Key with a different body silently discards the new batch
Status: **Confirmed defect** (`d/01-events-api.mts` §C).
What is wrong: `ingestEvents` returns the stored counts for a known key without reading the body; no body hash is
stored on `ChannelBatch`. The route answers 202 with the *earlier* batch's counts. The contract page tells Phoenix to
retry with the same key, so reuse is expected on their side; a key sequence that resets after a deploy drops whole
batches while reporting them accepted. Nothing is logged.
Where: `src/lib/events.ts:75-86`; `src/app/api/v1/events/route.ts:6-12`; `src/lib/api-docs.ts:137`.
How to reproduce: `d/01-events-api.mts` §C ("same key b1 with a DIFFERENT body").
Evidence: `batch b1 first → 202 {accepted:3}`; `same key, different body → 202 {accepted:3, deduped:0, ignored:0}`;
stored rows for the new sessions: 0.
Recommended fix: store a sha256 of the canonical body on `ChannelBatch`; on a key hit with a different hash answer
`409 idempotency_conflict` and log it; document the key scope (per channel, 24 h) on `/admin/api`.
How we will know it is fixed: `channel-api` test "same key, different body → 409, nothing stored".

### I3. Global approves the campaign as it is at click time, not the version shown in the queue
Status: **Confirmed defect** (`c/c2-approvals.mts` §4).
What is wrong: `approveCampaign(id, byUserId)` carries no `submittedAt`/version it saw; `editOffer` on a campaign in
review overwrites it in place. Between the Review page render and the Approve click, the advertiser can change
headline, category (e.g. to Betting), link, creative and age gate; the click approves the new content and the
`ReviewAction` says Global approved something Global never saw. Revisions already get this right.
Where: `src/lib/campaigns.ts:245-262`, `:413-416`; `src/app/admin/review/actions.ts:58-63`.
How to reproduce: `c/c2-approvals.mts` §4.
Evidence: `globalSaw: {headline:'Original headline', category:'Food & drink'}` → `approved: {headline:'CHANGED after
Global looked', category:'Betting', status:'live'}`.
Recommended fix: the queue row carries `submittedAt`; the action passes it; `approveCampaign` moves only
`where: {id, status:'review', submittedAt: seen}` and otherwise refuses with the existing "already decided" toast.
How we will know it is fixed: a test: submit, read, edit, approve-with-stale-stamp → `INVALID_TRANSITION`.

### I4. The landing page keeps paying rewards after the budget is spent; spend ends above budget, with no credit check
Status: **Confirmed defect** (`b/worked-example.mts` Phase 9).
What is wrong: the API gate is `deliveringWithBudget` (status + flight + budget left), but the landing routes use
`liveLink` → `isDelivering` (status + flight only). A share link minted earlier keeps landing, claiming and charging
rewards while `/offers` and `/share` already refuse the campaign; the reward cap is `Σ rewards ≤ budget × pct`, not
`Σ all charges ≤ budget`. Reward charges post with no credit-limit check (the credit pause is only in the daily job).
Why it matters: a campaign can overspend by up to `rewardCapPct` (20 % by default); the spec says rewards come out of
the budget.
Where: `src/lib/landing/respond.ts:27-33`; `src/app/o/[code]/claim/route.ts:10-17`; `src/lib/fraud.ts:118-122`.
Evidence: budget $10, delivery charged 1,000c; "landing page still live: true"; two friend claims → "spend 1200c on a
1000c budget" (hand: 1,000 + 2 × 100 = 120 %).
Recommended fix: `liveLink` uses `isDeliveringNow`; `evaluate` also refuses when `Σ charges + amount > budget`.
How we will know it is fixed: Phase 9 expects 410 once `leftCents ≤ 0`; `fraud.test.ts` pins spend ≤ budget.

### I5. Nothing binds a channel key to the campaigns or countries it may report on
Status: **Potential risk** (reproduced in a copy by making the seeded Boomplay channel live; it is not live in the seed).
What is wrong: an event's campaign is resolved by `offer_id` against every campaign that ever went live, with no check
that the campaign's country is in `Channel.countries`; `/offers` and `/share` ignore `countries` too; delivery ledger
lines carry no channel and settlement assumes every delivery is Phoenix's.
Why it matters: the day a second channel (or a compromised second key) goes live it can post billable impressions on
every campaign, mint share links on them, and all of it settles to Phoenix.
Where: `src/lib/events.ts:23-24,92-101`; `src/lib/offers.ts:76-88,134-136`; `src/lib/reports.ts:444-463`.
How to reproduce: `d/01-events-api.mts` §G.
Evidence: Boomplay (`[NG]`) `impression for the KE campaign → 202 accepted 2`; `GET /offers?country=KE → 200` with
three KE offers; `POST /share for cKE → 201`.
Recommended fix: require `campaign.country ∈ channel.countries` in `ingestEvents`, `offersFor`, `shareOffer`; stamp
`channelId` on delivery lines before a second channel is enabled.
How we will know it is fixed: a `channel-api` test with a live second channel asserting `ignored` and an empty list.

### I6. Event timestamps are accepted from any year, and billing rests entirely on Phoenix's word
Status: **Confirmed defect** (timestamps, `d/01-events-api.mts` §E; `b/extra-checks.mts` §15) · **Potential risk**
(no ceiling).
What is wrong: `eventSchema` checks ISO shape only: a 2030 impression is stored and will be charged when that day
comes; a 2020 one is counted in Impressions and Open rate and never charged (C2). Neither shows in the 14-day chart.
Dedupe is per (session, offer, type, UTC hour), `session_id` is any string, there is no rate limit and no
per-campaign-per-hour sanity cap, so a Phoenix-side bug (an SDK re-firing, a session id that changes on scroll) lands
on the invoice indistinguishable from delivery.
Where: `src/lib/events.ts:28-49,103-115`; `src/app/api/v1/events/route.ts`; `src/lib/api-docs.ts:102` ("planned").
Evidence: `ts in 2030 → accepted 1`; `ts in 2020 → accepted 1`; `campaignMetrics.imp` includes both; "24 hours of one
session on one day → accepted 24"; 10,000 events accepted in 1.1 s; 50 concurrent posts all 202.
Recommended fix: count as `ignored` any `ts` more than minutes in the future or before the campaign's `startsAt` /
last charged day; a per-channel limiter; a daily sanity check in the job that *holds* a day's line for Global when
impressions jump (e.g. 20× yesterday) instead of posting it.
How we will know it is fixed: `channel-api` tests for far-past/far-future `ts`; the limiter returns 429; a job test
"holds a day whose impressions jump 20×".

### I7. "Owed to Phoenix" has three definitions that disagree, and a second close of a month leaves the statement frozen
Status: **Confirmed defect** (C3, E1, E2).
What is wrong: (a) the stored statement = delivery lines on the invoices of that close, a line belonging to a month by
the *workspace's* billing-country calendar, rounded once; `/admin/settlement` sums by ledger date inside the
*campaign's* country month, rounded per market; the Review KPI sums by the workspace's month by date. They diverge for
an agency running a campaign in another market (MediaSpec, NG-billed, runs a Senegal campaign: its 31 Oct line at
23:59:59 Dakar is 00:59 on 1 Nov in Lagos). (b) `settle()` writes the statement with `createMany({skipDuplicates})`
and returns the existing row, so a workspace invoiced for that period by a *later* close (a replayed day, a late
batch, then the 2nd's run or Global's Close month) is settled to nobody.
Why it matters: Global reconciles with Phoenix from the page and pays from the statement; the two differ, and Phoenix is
silently under-settled after any second close.
Where: `src/lib/money.ts:336-354` (`settle`, `skipDuplicates: true` at 351); `src/lib/reports.ts:413-430, 449-461`;
`src/app/admin/settlement/page.tsx:30-43`.
How to reproduce: `c/c5-settlement.mts`; `e/run.sh 02-settlement-diff.mts 2026-11`; `e/run.sh 03-second-close.mts`.
Evidence: October statement 1,877c vs page 1,976c; November page $127.08 vs statement $128.07 (gap = the −179c Dakar
line); second close issued `INV-0057 60c` for November and left the statement at 12,807c while Σ invoiced delivery ×
0.55 = 12,840c. In a single-market month the gap is 0, so this is attribution, not arithmetic.
Recommended fix: one calendar per line (the campaign's market, since the day line is already cut at that midnight)
used by `closeMonth`, `settle`, `platformKpis` and `settlementByMarket`; for a closed month the page shows the
statement's own number; `settle()` updates an `open` statement to the recomputed sum and writes a correction row if it
is already `paid`. Audit the change.
How we will know it is fixed: a test with an NG workspace and an SN campaign whose last line lands after Lagos
midnight: page = KPI = statement; a test closing twice asserts `statement.amountCents === round(Σ delivery × share)`.

### I8. A placement revision re-prices delivery that already happened
Status: **Confirmed defect** (`c/c8-reprice.mts`).
What is wrong: `approveRevision` overwrites `Campaign.cpmCents`; `chargeDelivery` prices every impression of a day at
the campaign's CPM *at run time*; `ChannelEvent` stores no placement or rate. So the approval day's earlier hours are
charged at the new rate, and any replay of an uninvoiced earlier day (including Review's "Run daily job") recomputes
it at the new CPM: raise-only lines overcharge when the CPM rose and keep the old amount when it fell. Nothing can
reconstruct it afterwards. (The advertiser is also not told the new CPM in the approval notice; the edit form runs
with an infinite credit limit for a running campaign.)
Where: `src/lib/campaigns.ts:443-463`; `src/lib/jobs/daily.ts:129-146`; `src/lib/events.ts:103-111`.
Evidence: 1,000 featured impressions on 10 Nov charged −220; after `cpmCents` became 450 a replay raised the same line
to −450. 500 impressions at 450 + 500 at 120 with approval at noon → one line −120; by placement it is −285.
Recommended fix: stamp the CPM (or placement) on each `ChannelEvent` at ingestion and sum per event; or keep a dated CPM
history per campaign and price each impression by its `at`. Until then, refuse replays of a day whose CPM changed
after it. Say the new CPM in the revision notice and the edit form's cost box.
How we will know it is fixed: a test where the CPM changes mid-day and the line equals the per-impression sum; a
replay after a CPM change leaves an earlier line unchanged.

### I9. Owners' and Managers' pause, resume, end, budget, reward and credit-request actions leave no audit row
Status: **Confirmed defect** (`c/c3b-audit-owner.mts`).
What is wrong: the library functions write nothing to `AuditEvent` for these moves; the actions layer audits only when
the actor is Global. `endCampaign` releases budget − spend from credit, `changeWithoutReview` moves budget and the
airtime reward, `requestCredit` writes the row and nothing else.
Why it matters: the advertiser-detail History cannot show who paused a campaign or lowered a budget before a dispute.
Where: `src/app/app/(console)/campaigns/actions.ts:39-44` (`auditGlobal`); `billing/actions.ts:12`;
`src/lib/campaigns.ts:288-315, 377-400`; `src/lib/money.ts:417-420`.
Evidence: Owner resume → pause → resume → budget $10→$50 → end (released 5,000c): "audit rows added: 0"; across the
seeded DB 0 rows named `campaign.pause/resume/end/change/submit/edit`. The full audit-trail inventory is in
`c/report.md`.
Recommended fix: move the `audit(...)` calls into the library functions (as `approveCampaign`, `setCreditLimit` and
`saveCaps` already do) with the real actor and before/after, for every role.
How we will know it is fixed: `campaign-lifecycle.test.ts` asserts an `AuditEvent` per transition with the owner as actor.

### I10. Global is never told that a new advertiser registered or that a credit increase was requested; a declined owner is stuck
Status: **Confirmed defect** (A2, A3: `a/03-onboarding.mts`, `a/07-credit.mts`).
What is wrong: `createWorkspace` notifies only the workspace (`NOTIFY.wantsToJoin` exists and is never called);
`requestCredit` writes a `CreditRequest` and nothing else, and the Billing button stays enabled with no pending state.
A declined owner cannot start again: `createWorkspace` refuses any existing Owner, the action swallows the error, the
new-workspace page redirects anyone with a membership, and the banner offers nothing. The same rule means any invited
account (even a Viewer) can never create its own workspace.
Why it matters: J1 steps 4 and 6 depend on Global noticing; the toast promises "usually answered within a working day"
with nothing behind it; a business declined for a typo can only wait.
Where: `src/lib/workspaces.ts:18-31`; `src/lib/money.ts:417-420`; `src/app/app/new-workspace/{page,actions}.ts`;
`src/app/app/(console)/billing/RequestCredit.tsx`.
Evidence: "Global notifications added by registration: 0"; "requestCredit twice → same request? true | Global notified?
0"; "after decline, new workspace refused: ALREADY_HAS_WORKSPACE".
Recommended fix: `notifyGlobal` (and audit) in `createWorkspace` and `requestCredit`; Billing shows "Request sent on
{date}" and disables the button while one is open; decide the rule for declined owners (resubmit, or a second
workspace) and at minimum surface the refusal and give the declined banner an action.
How we will know it is fixed: `workspaces.test.ts`/`money.test.ts` assert a Global notification row; an onboarding
test covers decline → the owner's next step.

### I11. The Rewards page shows a cap the engine does not enforce; the sharer stats endpoint has no reward figure and over-counts claims
Status: **Confirmed defect** (B3, B4, E6).
What is wrong: a campaign is created with the schema default `rewardCapPct = 20` whatever the workspace ceiling, so
the page prints `budget × 20 %` while enforcement is `budget × min(campaign, workspace)`. `GET /api/v1/links/{code}/stats`
returns `claims` = every raw `Claim` row (repeats, blocked and held included) and no reward field, although the flow
audit and the API docs promise "reward earned".
Where: `src/lib/campaigns.ts` (create path never sets `rewardCapPct`); `src/app/app/(console)/rewards/page.tsx:30`;
`src/lib/fraud.ts:45-49`; `src/lib/link-events.ts:117-134`; `src/lib/api-docs.ts:81-93`.
Evidence: workspace ceiling 10 %, campaign created after: "Rewards page shows cap $20; engine enforces $10; the 11th
claim rejected"; `linkStats` = `{claims: 4, …}` for 2 rewarded shares, "stats has no reward field".
Recommended fix: set `rewardCapPct: workspace.rewardCapPct` on creation (or print the min); add `claims_unique`,
`rewarded`, `held` and `reward_local` to `linkStats`; align the docs.
How we will know it is fixed: page cap = `rewardCapCents` for every campaign; a `linkStats` test on the fixture above.

### I12. The landing page accepts another country's phone number, or a nonsense one, as the campaign's country
Status: **Confirmed defect** (`b/extra-checks.mts` §18; E5).
What is wrong: `normalisePhone` checks length only: a local-form number is accepted for *any* country, a 9-digit
subscriber part passes for Nigeria; `upsertConsumer`/`leaveDetails` store whatever string they are given (only the
details route normalises).
Why it matters: airtime goes to `+2548031234567` when a Nigerian types `08031234567` on a KE offer; the consumer
record and the per-sharer cap key on a number that is not theirs; the phone-reuse fraud rule rests on every caller
remembering to normalise.
Where: `src/lib/consumers.ts:6-23`; `src/app/o/[code]/details/route.ts:19`; `src/lib/link-events.ts:96`.
Evidence: `normalisePhone('08031234567','KE') = '+2548031234567'`; `('+234803123456','NG')` accepted; via the share
API a KE link was minted for that number.
Recommended fix: per-market mobile prefix and length rules in `MARKETS`; normalise (or refuse) inside `upsertConsumer`.
How we will know it is fixed: the inputs above return `null`; `leaveDetails` with a raw string returns the same link
as the E.164 form.

### I13. Creatives live on local disk and are never cleaned up; any signed-in user may upload
Status: **Confirmed defect** (lifecycle, who may upload, cross-workspace naming: `d/05-uploads.mts`, `d/04-idor.mts`) ·
**Potential risk** (redeploy, second instance).
What is wrong: `putCreative` writes to `UPLOAD_DIR` on the local disk; nothing replicates it, so a redeploy without a
persistent volume loses every creative Phoenix is serving. `POST /api/upload` needs only `requireUser`: a Viewer, or
the owner of an unapproved workspace, can fill the disk. A key uploaded in workspace A passes the submit check for a
campaign in workspace B. A file named by a rejected campaign is `in_use` forever; never-attached uploads are never
swept; creatives of campaigns in review are served publicly by UUID (low exposure).
Where: `src/lib/storage.ts:9,41-55,96-113`; `src/app/api/upload/route.ts:9`; `src/lib/creative-uploads.ts:32-40`.
Evidence: "openImage for a campaign IN REVIEW → served"; "Pesa Link naming Kola Bright's file → creativeMissing false";
"after REJECTED, delete → in_use; file still on disk? true"; a Viewer's upload row created.
Recommended fix: mount `UPLOAD_DIR` as a persistent volume now and move to object storage; gate uploads on
`requireMember('campaigns')`; a weekly sweep of unnamed `CreativeUpload` rows and rejected campaigns' files.
How we will know it is fixed: `upload-routes` test Viewer → 403; a sweep test; the deploy checklist names the volume.

---

## Improvement — would make the process easier or better

Each line: what · where · evidence script · fix. All are **Confirmed defect** unless marked.

1. **Printed invoice lines do not foot to the printed total** (each local line rounded alone, the total from USD).
   `invoices/[id]/print/page.tsx:37,54`; `c/c4-close.mts` §6 (INV-0052 ₦259,858 vs Σ lines ₦259,892), `e` run1 (₦37,914
   vs ₦37,913). Fix: store `amountLocal` on the invoice at issue and make the total the sum of the printed lines.
2. **Two seeded invoices have no ledger lines** (INV-0037 $2,840, INV-0046 $210): the PDF says "No lines on this
   invoice", the Billing statement for that month is empty, the total falls back to `inv.amountCents`.
   `prisma/seed/money.ts:59-73`; `a/02-invoices-delivery.mts`, `d/06-growth.mts`. Fix: seed lines that sum to the
   amount; `seed.test.ts` asserts it for every invoice.
3. **"Unbilled this month" and "Nov 2026 (to date)" include stragglers from earlier months** while the statement box
   shows only the month. `money.ts:183-191`; `a/06-unbilled-label.mts` (3,169 vs Σ Nov 2,669). Fix: a sub-line
   "includes $5.00 from earlier months", or show the straggler in the month's statement.
4. **Three different numbers are called rewards "paid"/"owed"**: advertiser pages = ledger (queued + sent), Global's
   ledger "Owed" = queued + sent + held, what reached sharers = sent. `reports.ts:74,84,479`,
   `rewards/page.tsx:22`; `b/extra-checks.mts` §13, `c/c6-rewards.mts` §1 (2,671c ledger vs 2,421c sent). Fix: label
   the advertiser figure "Rewards charged", show held separately.
5. **"Friends claimed" counts held payouts; "Claimed" counts only what Phoenix posts** (Root-link click-throughs are a
   `LinkEvent` the KPI never reads). `reports.ts:34,73-82,182`; `d/02-reporting.mts` (successful 91, held 2, charged
   89). *Potential risk* for link offers. Fix: show held separately; state the source of Claimed or take the greater.
6. **Money notifications the advertiser does not get**: invoice issued, invoice paid (credit released); the workspace
   decline rides on the "Campaign approved or rejected" toggle; pace warnings repeat daily with the same words (12
   rows). `money.ts:321-327, 358-380`; `workspaces.ts:96`; `daily.ts:278-299`; `a/05-daily-notifs.mts`. Fix: two
   notices in `closeMonth`/`markInvoicePaid`; a `system` kind for workspace decisions; de-duplicate pace warnings.
7. **One market without FX blocks every workspace's invoice**, reported only as `monthClose: 'no_fx'` in a JSON
   summary nobody sees; the job stops trying on the 3rd. `money.ts:285-286`; `daily.ts:232-244`; `c/c4-close.mts` §1.
   Fix: close per workspace, skip only markets without FX, `notifyGlobal` on any skipped close.
8. **The rates library accepts 0, negative and fractional CPM/FX** (only the server action guards; a fractional CPM is
   truncated by the integer column; `setShare(0)` is accepted). `rates.ts:25-34,57-62`; `c/c7-rates.mts` §1. Fix:
   validate in the library as `setShare` and `setCreditLimit` do.
9. **A revised offer that changes placement re-prices the live campaign silently** (Featured $2.20 → Splash $9.00
   mid-flight; the approval notice does not say). `campaigns.ts:408-427,443-463`; `a/08-revision.mts`. Fix: the new
   CPM in the notice and the edit form's cost box; confirm when it rises. (Overlaps I8.)
10. **A scheduled campaign starts only at the next daily run**, 2–5 hours after its market midnight. `daily.ts:98`;
    `campaign-status.ts:22-37`; `c/c2-approvals.mts` §1. *Potential risk.* Fix: treat `scheduled` with `startsAt ≤ now`
    as delivering in `deliveringWhere`.
11. **An invite link can be accepted by any account**; the invited address is then refused with "no longer valid"
    and the Owner is not shown the mismatch (by ruling 38; the gap is visibility). `invitations.ts:140-166`;
    `a/04-team.mts` step 2. Fix: mark on People "joined via the link sent to kemi@…"; require a match for Owner invites.
12. **Anyone can rewrite a sharer's channel attribution with a GET** (`/o/[code]/share?via=x`, no cookie or ownership
    check; crawlers will). `o/[code]/share/route.ts:11-21`; `b/extra-checks.mts` §16. Fix: only when the requester's
    `og_v` equals the link's sharer session, first non-null wins.
13. **Claim codes expire on the UTC day, are shown without an expiry, and nothing can verify them** (`ClaimCode` rows
    are never read after issuance). `claims.ts:27-54`; `landing/render.ts:65-66`; `b/worked-example.mts` Phase 10 (a
    code issued 00:30 Lagos expires 01:00). Fix: key on the market day, print `validUntil`, add a verification lookup.
14. **A paused or not-yet-started campaign's link says "This offer has ended."** `landing/respond.ts:27-33`;
    `copy.ts:91`. *Potential risk.* Fix: a "Not available right now" view for `paused`/`scheduled`.
15. **A large queued payout can be starved by smaller later ones** (`sendQueuedPayouts` skips and continues).
    `rewards.ts:193-216`. *Potential risk.* Fix: strict FIFO, alert Global at the first unaffordable payout.
16. **Growth**: `platformKpis` scans every impression on every `/admin/review` load (51 ms at 153k rows, linear);
    `settlementByMarket` 421 ms for 39k rows; `ChannelBatch` never pruned; no `(linkId, type, at)` index on
    `LinkEvent`, none on `PointsLedger.campaignId`; three uniqueness rules exist only in code (one invoice per
    workspace-month, one Root link per campaign-channel, one counted Claim per link-visitor). `d/06-growth.mts` plans.
    *Potential risk.* Fix: a `(type, at)` index, a daily rollup table written by the job, batch retention, the two
    indexes and `@@unique` constraints.
17. **Errors are logged without context and shown as a bare "page failed"**: the channel API logs no key name,
    Idempotency-Key or event count; console guards throw bare strings no call site catches; no request id.
    `api-responses.ts:24`; `landing/respond.ts:43`; `permissions.ts:42`. *Potential risk / Untested assumption* (what
    a thrown string renders as in production). Fix: log key name, batch key and count; `Error` subclasses with a
    stable digest; one logger with a request id.
18. **Small copy and form gaps**: the revised-offer notice says "{name} is in review" while the campaign is live;
    `inviteAction` answers an unknown role with the `INVALID_EMAIL` error; the Rewards caps Save has no toast.

---

## Working correctly — tested and verified

All of the following were exercised by script with the result compared to a hand calculation (script in brackets).

- **Delivery charges**: all 55 seeded delivery lines recompute as impressions in the market-local day × CPM snapshot
  ÷ 1000, rounded, dated at the last millisecond of the market day (`c/c1b-hand.mts`, `d/02-reporting.mts`, 55/55).
  Trace: 12,345 × 120c ÷ 1000 = 1,481.4 → −1,481; 7,890 → −947 (E). A day is never charged past the budget left.
- **Market-day boundary**: 22:59:59Z lands on Lagos 22 Nov, 23:00:00Z on 23 Nov; `ymd(23:00Z, SN) = 22 Nov` (`c1` §6).
- **Daily job idempotency**: `runDaily` twice for one day → second `skipped: true`; two concurrent replays → one line;
  313 reward lines for 313 charged payouts before and after; same batch keys return stored counts and store nothing;
  new keys with the same events dedupe every one (`c1` §4, `d/03-daily-job.mts` §4, E step 10).
- **Pricing snapshot and estimate**: CPM and FX in force are frozen on the campaign at submission; the cost box's
  impressions, opens and successful shares reproduce by hand (133,333 / 4,800 / 285.1 for $200 at 120c); credit in use
  rises by the budget at submission, not approval (E rows 21–36). Form rule and server rule agree at the credit
  boundary ("Over your credit limit of $2,000 by $1" both sides, `a/07b-form-parity.mts`).
- **Approvals**: approve before start → `scheduled` with a Root link, one `ReviewAction`, one audit row, the right
  notification; after start → `live`. Two Globals approving the same campaign, revision or workspace at once: one
  succeeds, one `INVALID_TRANSITION`, exactly one review action. Approving inside a pending or declined workspace is
  refused; a second decline refused; rejecting a revision leaves headline, placement, CPM and version untouched;
  reject needs a known code and stores note and code (`c/c2-approvals.mts`).
- **Credit lifecycle**: lowering the limit under use is audited before→after and tells members; `pauseOverCredit`
  pauses live campaigns with `pausedBy: 'credit'`; Resume is refused with the excess; a credit request is
  one-per-workspace, approval sets the limit, audits two rows, tells the requester; Resume then works. Limit 0
  accepted, −1 and 2³¹ refused (`a/07-credit.mts`, `c/c3-credit.mts`).
- **Billing figures equal the ledger**: Kola Bright unbilled 2,669 = uninvoiced delivery 2,534 + rewards 135;
  committed 67,331; in use 70,000; available 80,000; 3101 shows "$1,500 / $700 / $800 / $26.69 · ₦41,370"
  (`a/01-inspect.mts`, `a/10-browse.out`).
- **Month close**: `MONTH_NOT_OVER` before the month ends; two concurrent closes issue exactly one invoice per
  workspace with unique sequential numbers from INV-0052; each holds all and only its workspace's uninvoiced lines
  dated before its market's 1st; re-close issues nothing; FX = the market's rate at the month's last instant (a change
  on the 1st is ignored); due = local midnight ending the 15th; `invoice.issue` audited; `overdue` from the midnight
  ending the due day (`c/c4-close.mts`, E rows 122–142). Stored amount = Σ lines for INV-0041 (2,640) and INV-0044 (1,013).
- **Payment**: Mark paid flips status, posts one `+amount` payment line, is idempotent, releases credit (in use drops
  from budget to budget − spend), the Rewards ledger flips to `paid` (E rows 154–167).
- **Settlement arithmetic** (single-market): statement = Σ invoiced delivery × share rounded once; rewards excluded
  as spec §6.6 says; a share change prices the next statement only; audited (`c/c5-settlement.mts`, E rows 143–150).
- **Rewards engine**: per-sharer workspace cap, the platform floor of 5, the %-of-budget cap (exactly 20 × 100c then
  `rejected cap`), market-local day for the caps, chains of unlimited depth paying the *direct* sharer only, one link
  per (parent, consumer), replays create no second payout, ledger = payouts, points = 10 × (queued + held); the
  payout run sends oldest-first, skips what the balance cannot cover, never pays twice, top-up releases the rest
  (`b/worked-example.mts`, 48/48 checks). Sharer self-claim from own session `blocked same_device` (E).
- **Rewards admin**: aggregator balance = top-ups − sent; a top-up adds exactly its amount with an `AggregatorTopup`
  row and an audit row; −5000, 0, 0.5 refused `INVALID`, 2³¹ `TOO_LARGE` (`c/c6-rewards.mts`).
- **Rates**: every change inserts a dated row and keeps history; `currentCpmCents(…, 1 Nov)` still answers the old
  rate; running campaigns keep their snapshot (`c/c7-rates.mts`).
- **Channel API**: no key / wrong key / not-live channel → 401; body channel ≠ key's channel → 400; validation is
  all-or-nothing (one bad `ts` in three → nothing stored); 501 events → `too_many_events`; unknown types ignored;
  events for never-live, scheduled or made-up offers ignored; another channel's token ignored; keys stored as sha256,
  rotation keeps the old key 24 h; 500 events in 81 ms, 10,000 in 1.1 s, 50 concurrent posts all 202 (`d/01-events-api.mts`).
- **Reporting equals the rows**: Supa10 impressions 26,671 / opens 1,432 / claimed 472 / shares 136 / friends opened
  295 / friends claimed 91 / rewards $7.12 / spend $70.23 each equal the raw count or sum; the 14-day series in
  `Africa/Nairobi` matches day for day; Sharing totals = Σ rows; home card matches (`d/02-reporting.mts`). Trace: every
  campaign page, Sharing, Billing, Invoices, Advertisers and Rewards-ledger figure matched its rows (E rows 98–121).
- **Permissions and IDOR**: `ownCampaign` returns null for a foreign campaign; reward, invite, role, member and
  notification actions with a foreign id throw `NOT_FOUND` and change nothing; every console action calls
  `requireMember(<capability>)` or `requireAdmin()` and never takes a workspace id from the client; Global is decided
  from the database on every request; the capability table matches the spec (`d/04-idor.mts`).
- **Team**: email normalised; a second invite retires the first; Resend retires the old token; expired accept refused;
  revoke/resend scoped to the active workspace; the last Owner can be neither demoted nor removed; a member of two
  workspaces keeps both roles; no token in any audit row (`a/04-team.mts`).
- **Revisions**: the live version keeps running with money untouched; a second edit replaces the pending row;
  "Change without review" applies at once while a revision waits; End now drops the pending revision and releases
  budget − spend (`a/08-revision.mts`).
- **Uploads judge bytes, not names**: spoofed MIME, random bytes, SVG, HTML-as-JPEG, GIF, empty → `unsupported_type`;
  2 MB exactly stored, +1 byte refused; splash 4 MB, MP4 25 MB; a splash placed on a card is caught; seven traversal
  keys → `not_found`; polyglots served with `nosniff` (`d/05-uploads.mts`).
- **Preview routes** write nothing and answer 403; Root `?go=claim` records a Claim with no payout (B).
- **Schema**: every amount column is integer cents or `Decimal` FX/share; 25 FKs RESTRICT except two documented SET
  NULLs; no orphan ledger, payout or event rows; 0 payouts charged twice; 0 held/blocked payouts charged; 0
  campaigns over budget in the seed (`d/06-growth.mts`).

## Not covered by this audit

The real Phoenix wall and SDK (only our side of the contract); a real airtime aggregator (`sendQueuedPayouts` flips
status and a balance; no provider call exists); email (none exists; notifications are in-app rows); the rendered
console in a browser beyond one read-only pass of Billing and Invoices on 3101 (page data functions were called
directly); a multi-instance deployment; `scripts/daily.ts` under a real cron; points redemption and consumer OTP (not
built). The baseline suite does not cover: same-key-different-body, out-of-range or backdated timestamps, a second live
channel, the cron's skip of late impressions, a missed cron day, rate limiting, uploads by a Viewer, orphan creative
cleanup, held payouts in "Friends claimed", the second-close settlement gap, or the IP-based reward drain.
