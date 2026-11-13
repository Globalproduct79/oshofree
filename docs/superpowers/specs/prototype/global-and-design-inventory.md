# OfferGrid prototype inventory: Platform (Global) console, app shell, consumer surfaces, design system

Source: `offergrid-v4.html` (single file, called "OfferGrid"; a copy sits next to this document). This inventory covers the **Platform (Global) console**, the **app shell**, the **consumer and Phoenix surfaces**, and the **design system**. A sibling inventory covers the advertiser workspace screens (Campaigns, New campaign wizard, Sharing, Rewards, Billing & credit, Invoices, People, Workspace, Notifications). Those screens appear here only where a Global flow crosses into them.

How this was captured:

- I read the prototype's whole script, which is about 330 readable lines after the 345 KB embedded-image line. So every string, formula and handler quoted below comes from the code, not from guesswork.
- I drove the prototype with headless Chromium (Playwright) at 1280 and 390 wide.
- Screenshots are in `shots-global/` (43 files; index at the end).

Conventions used below:

- **Copy in quotes is verbatim**, including `—` (em dash), `·` (middle dot), `›`, `−` (U+2212 minus sign in money) and currency symbols.
- `{x}` marks an interpolated value.
- "Today" in the prototype is the real current date. All campaign dates are relative to it (`d(n)` = today + n days). The screenshots were taken on **13 Nov 2026**, so "16 Nov" means today + 3.
- **Numbers vary per page load.** Impressions and delivery charges are deterministic. Opens, claims, shares and rewards use `Math.random()`. For screenshots I seeded `Math.random` (mulberry32, seed 20261113) so the images and the numbers below agree. A rebuild must compute these numbers with the formulas given, not copy the sample values.
- State lives in memory only. A reload resets everything.

---

## 1. Who is Global and what it controls

### 1.1 What "Global" is

"Global" is the platform operator: the company running OfferGrid between advertisers and the Phoenix Browser channel. Global's copy appears throughout the advertiser side, for example "Global usually decides within one working day", "set by Global", "ask Global to raise the limit" and "Global tops up the aggregator and recharges you through your invoice". In the prototype, Global is not a separate login. It is a mode flag (`admin = true`) that you switch on in the workspace switcher.

Global controls the following:

| Area | What Global does | Screen |
|---|---|---|
| Advertiser onboarding | Approve or decline new workspaces | Review ("New advertisers") |
| Campaign review | Approve / reject (with a free-text reason) / preview every submitted campaign | Review ("Campaigns waiting") |
| Credit | Set each workspace's credit limit (USD) | Advertisers |
| Pricing | Edit the CPM rate card per country × placement for the Phoenix channel | Rates |
| Channel revenue share | Set Phoenix's share of delivery charges (default 55%) | Phoenix settlement |
| Reward funding | Top up the airtime aggregator (Reloadly) balance | Rewards ledger |
| Integration contract | Read-only API documentation for Phoenix engineers | Phoenix API |
| Demo clock | "Simulate a day" | Review header |

### 1.2 How you become Global

Three ways in:

1. **Workspace switcher** (topbar, the `<select>` on the right, `aria-label="Workspace"`). It has five options in this order: "Kola Bright", "MediaSpec (agency)", "Pesa Link", "SunFresh Juices", "Platform (Global)". Choosing "Platform (Global)" sets `admin = true` and lands on **Review**.
2. **Clicking any item in the PLATFORM nav group while inside a workspace.** In workspace mode the sidebar shows all advertiser groups **plus** the PLATFORM group (see 1.5). Clicking e.g. "Rates" flips `admin = true` and opens Rates. The switcher then shows "Platform (Global)".
3. The "▦ Workspaces" button does **not** switch anything. It focuses the switcher `<select>` and shows the toast "Pick a workspace from the switcher on the right" (`shots-global/shell-wsbtn-toast-1280.png`).

### 1.3 What changes when you switch to Platform (Global)

Compare `shots-global/shell-workspace-1280.png` (Kola Bright) with `shots-global/shell-global-1280.png` (Global).

| Element | In a workspace (e.g. Kola Bright) | In Platform (Global) |
|---|---|---|
| Sidebar logo tile | Workspace initials, e.g. "KB", on **ink** `#14171D` | "OG" on **Phoenix orange** `#FF5A1F` |
| Sidebar title / subtitle | "Kola Bright" / "Brand workspace · Nigeria" (format `{type} workspace · {country}`) | "OfferGrid" / "Platform console" |
| Sidebar nav | CAMPAIGNS, GROWTH, MONEY, ORGANISATION **and** PLATFORM groups | PLATFORM group only (Review, Advertisers, Rates, Phoenix settlement, Rewards ledger, Phoenix API) |
| Avatar circle (topbar) | Initials of the workspace's first person (the Owner), e.g. "TO" (Tunde Okafor) | "GL" |
| Switcher value | Workspace name | "Platform (Global)" |
| Bell count | Number of that workspace's notifications (all, no read state) | Campaigns in review + workspaces pending approval (3 on load) |
| Bell panel items | The workspace's notification list | One item per campaign in review and per pending workspace (see 4.4) |
| Banner under topbar | Hidden. A pending workspace shows "**Awaiting approval** — Global checks new advertisers within one working day. You can build campaigns now; they go live once the workspace is approved." | Always shown: "**Platform** — you are acting as Global. Approvals, rates and settlements here affect every advertiser." (the bold word is orange) |
| Landing page | Campaigns, with greeting "{Good morning/afternoon/evening}, {Owner first name}" | Review, with title "Review" and no greeting |
| Breadcrumb root | "{Workspace name} › …" | "Platform › {Page}" |

### 1.4 Global inside a workspace (Global versus Owner)

Global gets into a workspace in three ways:

- **Switcher**: pick any workspace name. This sets `admin = false`, `ws = that workspace` and lands on its Campaigns page.
- **Advertisers → "Open workspace"** (one button per row). The effect is the same and lands on that workspace's Campaigns page (`shots-global/advertisers-open-workspace-1280.png`).
- **Review → "Live now" card click.** The code intends this to switch into the campaign's workspace and open the campaign, but the handler is overwritten (see Defects D1). In practice it opens the campaign detail **while staying in Global mode**, with a breadcrumb naming whichever workspace was last selected. For example, it reads "Kola Bright › Campaigns › Supa10 Jackpot — Kenya" even though that campaign belongs to MediaSpec (`shots-global/review-livecard-detail-1280.png`). The detail page's Pause, "See it on Phoenix", "Change without review" and "Edit offer and resubmit" all work from there. Global can pause a campaign from this view; the toast is "Paused — leaves Phoenix within 15 minutes. Resume any time."

Once inside a workspace, **Global is indistinguishable from that workspace's Owner**:

- There is no "viewing as" banner.
- The avatar shows the Owner's initials.
- The bell shows the workspace's notifications.
- The nav is the full advertiser nav plus PLATFORM.

Global can do everything the Owner can and nothing more:

- create and submit campaigns
- pause and resume
- change budget, end date and share reward
- edit the offer and resubmit
- end a campaign
- edit reward per share and caps
- use "Request a higher limit" (toast only)
- use "Mark paid" on invoices (labelled demo; toast "{INV} marked paid (demo) — credit released")
- invite people
- toggle notification preferences

Global's special powers (approval, credit limit, rates, share, top-up) exist **only** on the Platform pages. They are never surfaced inside a workspace.

### 1.5 Permission model the prototype implies

The prototype enforces **no permissions at all**:

- Every workspace's sidebar includes the PLATFORM group, and clicking it makes you Global.
- People roles are display-only. The role `<select>` on People has no change handler, and nothing checks roles.

The model the copy describes:

| Actor | What the copy says they can do | Where stated |
|---|---|---|
| **Global** (platform operator) | Approve workspaces and campaigns, set credit limits, rates, the Phoenix share, top up the aggregator. "Approvals, rates and settlements here affect every advertiser." | Global banner, Platform page leads |
| **Owner** | "Everything, including invoices, credit and people" | People → "What each role can do" |
| **Manager** | "Create, submit, edit, pause campaigns; see reports" | same |
| **Viewer** | "Reports and invoices, read-only" | same |
| **Agency** (a workspace *type*, not a role) | Runs campaigns for several brands. The Brand field in New campaign is editable with the hint "— client" (for a Brand workspace it is read-only and pre-filled with the workspace name). Workspace page shows a "Client workspaces" box: "Each client gets its own workspace with your team added." + "+ Add client brand" (no handler). Review lists agency campaigns as "{brand} via {agency workspace}", e.g. "777Bet Metro via MediaSpec (agency)". | New campaign, Workspace, Review |

Role list order in the People invite select: "Manager", "Viewer", "Owner". The roles available on member rows are Owner / Manager / Viewer.

**Recommended rebuild interpretation (inferred, not in the prototype):**

- Global is a platform-staff role outside any workspace.
- The PLATFORM nav group renders only for Global.
- When Global enters a workspace, the workspace behaves as for an Owner, with a visible "viewing as Global" indicator.

The open questions list includes the decision on impersonation and audit.

### 1.6 Every Global action and what the advertiser sees afterwards

| Global action | State change | Advertiser-visible result | Toast (Global side) |
|---|---|---|---|
| Approve campaign (start date in future) | `status = "scheduled"` | Card pill "Scheduled", card main line "Starts {d MMM}". Detail pill "Scheduled", chart subtitle "Scheduled.". Notification "{campaign name} is scheduled for {d MMM}" with empty sub, so it renders "· now". (`shots-global/advside-scheduled-home-1280.png`) | "Approved — advertiser emailed" |
| Approve campaign (start ≤ today) | `status = "live"` | Pill "Live". Notification "{campaign name} is live on Phoenix" · now | same |
| Reject campaign | `status = "rejected"`, `note = reason` | Card pill "Rejected", card main line "Not approved" + the reason (right side). Detail: pill "Rejected" then the reason in red 13 px. "Save changes" disabled, no Pause/Resume, chart subtitle falls through to "Scheduled." (defect D6). "Edit offer and resubmit" still works and sends it back to review. Notification "{campaign name} was not approved" / "{reason} · now". (`advside-rejected-home-1280.png`, `advside-rejected-detail-1280.png`, `advside-rejected-bell-1280.png`) | "Rejected — advertiser emailed with the reason" |
| Approve workspace | `status = "approved"` | Pending banner disappears. Notification "Your workspace is approved" / "Submit campaigns any time · now" | "{workspace} approved — owner emailed" |
| Decline workspace | `status = "declined"` | **No notification.** Pending banner disappears (the banner only exists for `pending`). Workspace page "Approval" shows raw lowercase "declined" with no pill colour. The workspace can still submit campaigns, and Global can still approve them (defect D4) | "{workspace} declined" |
| Change credit limit | `credit = value` | Billing & credit "Credit limit" KPI shows the new value; Available recalculates. Notification "Your credit limit is now ${n}" · now | "Credit limit updated — owner emailed" |
| Edit a rate | `RATES[country][placement] = value` | New campaign placement tiles and estimate use the new CPM. Existing campaigns' "Placement · ${cpm}" also changes, and Simulate a day delivers at the new rate (contrary to "Changes apply to new campaigns only"; defect D7) | "Rate updated for new campaigns" |
| Change Phoenix share | `SHARE = value` | Nothing advertiser-visible | none (page re-renders) |
| Top up aggregator | `AGG_BAL += amount` | Nothing advertiser-visible | "Aggregator topped up" |

---

## 2. Platform screens

### 2.0 Shared anatomy of every Platform page

Each page is rendered into `.wrap` (padding 22px 32px 60px, max-width 1240px) by the same `head(crumb, title, lead, actions)` helper:

1. **Breadcrumb** `.crumb`: "Platform › {Page}" (13 px). "Platform" is ink3 `#9AA0AE`; the page name is in a `<span>` in ink2 `#5B6170`.
2. **Header** `.head`, a flex row:
   - left: `h1` (28 px / 700 / letter-spacing −0.03em) and lead `p` (14 px, ink2, max-width 62ch)
   - right: actions `.acts`, right-aligned and wrapping.
3. Body.

**Page titles and lead sentences (verbatim):**

| Nav label | `h1` | Lead |
|---|---|---|
| Review | Review | "Nothing reaches a consumer until someone here approves it. Betting and draws must carry a licence number." |
| Advertisers | Advertisers | "Every workspace on the platform, with credit limits and approval." |
| Rates | Rates | "Per 1,000 impressions, in USD, per country, placement and channel. Changes apply to new campaigns only." |
| Phoenix settlement | Phoenix settlement | "What the channel is owed from delivered impressions, settled monthly." |
| Rewards ledger | Rewards ledger | "Airtime and data owed to sharers, per campaign, and the aggregator balance that pays it." |
| Phoenix API | Phoenix API | "The contract Phoenix's engineers build against: offers out, events in." |

**KPI tile** (`metric(title, value, sub, fill%, openLink?)`, class `.mc`), used on Review, Settlement and Rewards ledger:

- white card, 1 px `#E6E8EE` border, radius 14 px, padding 18px 20px 14px
- row 1: title (14 px / 600) with a green 8 px dot pushed right. The dot is always green and carries no meaning.
- row 2: value (30 px / 700 / −0.03em)
- row 3: 3 px track `#F0F1F4` with an orange `#FF5A1F` fill at `fill%` (100% if omitted, clamped to 100)
- row 4: sub-text (12 px, ink3) and an optional "Open ›" link (not used on Platform pages)
- the grid is `repeat(auto-fill, minmax(240px, 1fr))` with a 16 px gap. At 1280 wide with the 248 px sidebar this gives **three tiles on the first row and the fourth wrapping to a second row**, as the screenshots show.

### 2.1 Review

Screenshots:

- `review-default-1280.png` (default)
- `review-preview-video-1280.png`, `review-preview-splash-1280.png` (Preview modal)
- `review-approved-1280.png` (after approving one)
- `review-rejected-1280.png` (after rejecting the other, so "Nothing waiting.")
- `review-empty-1280.png` (workspace approved too, so no "New advertisers" box)
- `review-pendingws-1280.png` (a campaign from an unapproved workspace)
- `review-declined-1280.png` (after Decline)
- `review-after-simulate-1280.png`
- `review-livecard-detail-1280.png`
- `review-default-390.png`, `review-preview-390.png`

**Header actions:** "Simulate a day" (`.btn.g`; see 5.2).

**Block 1: Platform KPI strip** (`pK()`; four `.mc` tiles):

| Tile title | Value | Sub-text | Fill |
|---|---|---|---|
| "Live on Phoenix" | count of campaigns with `status = live` (4) | "{n} waiting for review" (n = campaigns in review) | 100 |
| "Impressions" | `fmt(Σ imp over all campaigns)` (678.6k) | "{pct(Σ opens, Σ imp)} open rate" (4.1%) | 100 |
| "Charged for delivery" | `usd(gross)` where `gross = Σ (spend − rewardPaid)` over **all** campaigns ($1,115) | "+ {usd(Σ rewardPaid)} rewards" (+ $119) | 100 |
| "Owed to Phoenix" | `usd(gross × SHARE)` ($613) | "{usd(gross × (1 − SHARE))} kept by Global" ($502) | SHARE × 100 (55) |

**Block 2: "New advertisers"** box. This is rendered only when at least one workspace has `status = pending`.

- `h3` "New advertisers"; sub "Approve the workspace before any of its campaigns can go live."
- One row per pending workspace (`.q` grid `1fr auto`):
  - left: "**{name}** · {type} · {country}", then a `p` "Owner {owner name} · default credit {usd(credit)}". Example: "**SunFresh Juices** · Brand · Ghana" / "Owner Kofi Mensah · default credit $500".
  - right, stacked: "Approve" (`.btn.p.s`) and "Decline" (`.btn.g.s`).
- Approve: workspace `status = approved`, notification to the workspace, toast "{name} approved — owner emailed", box re-renders (disappears if no other pending).
- Decline: `status = declined`, toast "{name} declined", **no confirmation and no notification**.

**Block 3: "Campaigns waiting"** box.

- `h3` "Campaigns waiting"; sub (the review checklist): "Real offer · lawful in market · terms clear · link works · betting and draws carry a licence or approval number and show 18+."
- One `.q` row per campaign with `status = review`, in data order. Newly submitted campaigns are prepended, so they appear first.
- Grid columns: `120px 1fr auto`, gap 16 px, row padding 16 px 0, 1 px divider between rows.
  - **Col 1, cover** (120 × 80, radius 9): the creative image (`background-size: cover`) or the tile colour with brand initials (22 px / 800 white).
  - **Col 2, body:**
    - Line 1: "**{headline}** · {brand} via {workspace name}". The part after the headline is in ink3. Example: "**Win a year of Kola Bright** · Kola Bright via Kola Bright".
    - `p`: the full consumer description.
    - Tag chips (`.tagp`), in this order: country name · category · placement label · budget `usd` · "{start d MMM} – {end d MMM}" · redeem ("claim code" for code offers, otherwise the link URL) · "reward {local symbol}{reward}" (no space, e.g. "reward ₦100", "reward TSh500", "reward GH₵50").
    - Amber warning boxes (`.warn`), conditional:
      - Workspace pending: "Workspace not yet approved — approve it first."
      - Betting or draw (category = "Betting" **or** headline matches `/draw|jackpot/i`): "Betting or draw — {licence part} · 18+ {age part}". The licence part is "licence number present ✓" if the description matches `/licen|approv|NLRC|BCLB|LONASE|GBT/i`, else "no licence number found ✗". The age part is "shown ✓" if the campaign's 18+ flag is set, else "missing ✗".
      - Seed data note: "December draw teaser" does **not** trigger this, because its headline "Win a year of Kola Bright" contains neither word and its category is Food & drink.
  - **Col 3, actions** (stacked, 6 px gap):
    - "Approve" (`.btn.p.s`, **disabled** while the owning workspace is `pending`)
    - "Reject" (`.btn.g.s`)
    - "Preview" (`.btn.g.s`)
- **Empty state:** "Nothing waiting." (`.empty`, centred ink3, 50 px padding).

**Approve** behaviour:

- `status = scheduled` if the start date is after now, else `live`
- notification to the owning workspace (see 1.6)
- toast "Approved — advertiser emailed"
- review list re-renders.

**Reject** behaviour:

- Opens a **native browser `prompt()`** (not a styled modal): message "Reason sent to the advertiser:", pre-filled "Terms unclear — say where the offer can be redeemed."
- Cancel aborts.
- OK with any text (even empty) sets `status = rejected`, stores the text as the campaign's `note`, notifies the workspace "{campaign name} was not approved" / "{reason}", toasts "Rejected — advertiser emailed with the reason".
- **There are no reason codes, no "request changes" action, no reviewer identity and no decision history.**

**Preview:** opens the "On Phoenix" phone modal for that campaign (section 5.1). The modal copy is advertiser-facing ("Your card, outlined…") even when Global opens it.

**Block 4: "Live now"** section (outside any box):

- `.sect` header: `h3` "Live now" (17 px) + count in ink3.
- Below it, a card grid (`repeat(auto-fill, minmax(250px, 1fr))`, gap 16) of every live campaign on the platform.
- Each card uses the advertiser campaign-card component:
  - 118 px cover with status pill top-left, "18+" badge top-right if flagged, placement label bottom-right
  - headline (14 px / 700)
  - "{brand} · {country} · {n}d left"
  - "{fmt(imp)} impressions" (16 px bold) and "{open rate} open rate"
  - 5 px orange spend bar
- Click: see 1.4 and defect D1.

**Stale counts:** after Approve, Reject, Approve workspace or Decline, the list re-renders but the **sidebar Review badge and the bell count do not update** until the next navigation (defect D2).

**Review object model (implied):**

- `Campaign.status` ∈ {draft, review, scheduled, live, paused, ended, rejected}
- `Campaign.note`: rejection reason, free text
- `Workspace.status` ∈ {pending, approved, declined}
- A rebuild needs a `ReviewDecision {campaignId | workspaceId, decision: approve | reject | decline, reason (text), reviewerId, decidedAt}`. The prototype stores none of this beyond the status and note.

### 2.2 Advertisers

Screenshots:

- `advertisers-default-1280.png`
- `advertisers-credit-edited-1280.png`
- `advertisers-declined-1280.png`
- `advertisers-open-workspace-1280.png`
- `advertisers-default-390.png`

**Header actions:** none.

One `.box` containing one table (no search, no filters, no sorting, no pagination, no row click):

| Column | Content | Formula / source |
|---|---|---|
| "Workspace" | **{name}** + line break + owner name (small, ink3) | `people[0]` |
| "Type" | "Brand" or "Agency" | |
| "Country" | Billing country name | `MKT[mkt].n` |
| "Status" | Status pill: "Approved" (green), "Pending approval" (amber). After Decline: raw text "declined" with an uncoloured dot (no CSS rule; defect D4) | |
| "Campaigns" | "{total} " + small ink3 "({live} live)" e.g. "3 (1 live)" | count of campaigns with `ws = id`; live = status live |
| "Credit limit" | **Editable number input** (`step 100`, width 96 px, 1 px border, radius 7, padding 6px 8px), value in USD | `credit` |
| "In use" | `usd(creditUsed(w))` | see formula below |
| "Outstanding" | `usd(outstanding(w))`, text **amber** `#B7791F` when > 0 | Σ invoice amounts whose status is due or overdue |
| (no header) | "Open workspace" button (`.btn.g.s`, nowrap) | sets `admin = false`, switches to that workspace, opens its Campaigns page |

**Formulas:**

- `creditUsed(w)` = outstanding(w) + unbilled(w) + Σ (budget − spend) over campaigns of `w` with status ∈ {live, review, scheduled, paused}.
- `unbilled(w)` = −Σ of negative ledger amounts whose date label contains "Nov". The current month is hard-coded by string match.

**Seed rows (seeded run):**

| Workspace | Owner | Type | Country | Status | Campaigns | Credit limit | In use | Outstanding |
|---|---|---|---|---|---|---|---|---|
| Kola Bright | Tunde Okafor | Brand | Nigeria | Approved | 3 (1 live) | 1500 | $702 | $0 |
| MediaSpec (agency) | Dolapo Adeyemi | Agency | Nigeria | Approved | 5 (2 live) | 8000 | $5,933 | $3,610 (amber) |
| Pesa Link | Wanjiru Kamau | Brand | Kenya | Approved | 1 (1 live) | 500 | $372 | $210 (amber) |
| SunFresh Juices | Kofi Mensah | Brand | Ghana | Pending approval | 0 (0 live) | 500 | $0 | $0 |

**Credit-limit edit** fires on `change` (blur or Enter):

- sets `credit`, notifies the workspace "Your credit limit is now {usd}"
- toasts "Credit limit updated — owner emailed"
- **the table is not re-rendered**
- no confirmation, no validation (negative or zero are accepted)
- no history.

**Absent (asked about, not in the prototype):**

- an advertiser detail page
- suspend or reactivate
- payment terms editing (Terms is fixed copy "Net 14" on the workspace Billing page)
- account manager assignment (fixed "Obinna A.")
- a "view as" mode distinct from simply entering the workspace
- approve or decline buttons on this page (only on Review)
- any list of requests sent via "Request a higher limit".

**Object model (implied):**

```
Workspace {
  id, name, type: Brand|Agency, mkt: country code (billing),
  credit: USD limit, status: pending|approved|declined,
  people: [name, role], invoices[], ledger[], notifications[], prefs{}
}
```

### 2.3 Rates

Screenshots: `rates-default-1280.png`, `rates-edited-1280.png`.

**Header actions:** none.

**Channel pills** (`.pills`, above the content):

- "Phoenix Browser" with suffix "live" (pressed: orange outline and tint)
- "Boomplay" with suffix "coming soon" (unpressed)
- **Neither pill has a click handler.** They are indicators, not tabs.

**Left column (`.two`, 1fr), box "Phoenix Browser · CPM in USD":**

- sub: "Floor from the 5 Nov call: $1.2–1.5 cards, video $4–6. Video and splash are subject to Phoenix confirming inventory."
- Table header: "Country" | "Wall card" | "Featured tile" | "Video" | "Splash" | "Local FX".
- One row per market. The country name is bold. Each rate cell is a number input (`step 0.1`, width 76 px, value with 2 decimals). Local FX is ink2 text "{symbol}{fx}".

| Country | Wall card | Featured tile | Video | Splash | Local FX |
|---|---|---|---|---|---|
| Nigeria | 1.20 | 2.20 | 4.50 | 8.00 | ₦1,550 |
| Kenya | 1.50 | 2.80 | 5.50 | 9.00 | KSh129 |
| Ghana | 1.30 | 2.40 | 4.80 | 8.00 | GH₵15.5 |
| Tanzania | 1.20 | 2.20 | 4.20 | 7.50 | TSh2,600 |
| Senegal | 1.40 | 2.60 | 5.00 | 8.50 | F610 |

**Editing a cell** (`change` event):

- sets `RATES[country][placement]`, toasts "Rate updated for new campaigns"
- no save button, no confirmation, no validation
- **no effective date and no history**
- the change takes effect immediately everywhere, including existing campaigns' displayed CPM and Simulate-a-day delivery (defect D7)
- FX values are **not editable** here.

**Right column (360 px):**

- Box "Boomplay": sub "Phoenix's acquisition. Same campaign, same rate-card shape, different inventory. Not live."; button "Add channel rates" (`.btn.g`, **disabled**).
- Box "Expected open rates": two-column table with no header; values right-aligned bold.

  | Placement | Rate |
  |---|---|
  | Wall card | 3.6% |
  | Featured tile | 5.5% |
  | Video | 7.0% |
  | Splash | 9.0% |

  Sub below: "Used in advertiser estimates. Replace with observed rates after launch." These rates are read-only.

**Channel share:** not on this page. It lives on Phoenix settlement.

**Object model (implied):**

```
Channel  { id: phoenix|boomplay, name: "Phoenix Browser"|"Boomplay", live: bool }
Market   { code: NG|KE|GH|TZ|SN, name, currency: NGN|KES|GHS|TZS|XOF, symbol: ₦|KSh|GH₵|TSh|F, fxPerUsd }
RateCard row { channelId, marketCode, placement: card|featured|video|splash, cpmUsd }
   (no effectiveFrom/To in prototype; the lead copy promises "new campaigns only", so a rebuild needs effectiveFrom + campaign-level rate snapshot)
ExpectedOpenRate { placement, rate }
```

### 2.4 Phoenix settlement

Screenshots: `settlement-default-1280.png`, `settlement-share-60-1280.png`.

**Header actions:** none.

**KPI strip:**

| Tile | Value | Sub | Fill |
|---|---|---|---|
| "Delivery charged" | `usd(gross)` ($1,115) | "this month, all advertisers" | 100 |
| "Phoenix share" | `round(SHARE × 100)%` (55%) | "of delivery, not of rewards" | SHARE × 100 |
| "Owed this month" | `usd(gross × SHARE)` ($613) | "statement on the 1st" | 100 |
| "Global keeps" | `usd(gross × (1 − SHARE))` ($502) | "before aggregator and payment costs" | (1 − SHARE) × 100 |

`gross` = Σ (spend − rewardPaid) over **all** campaigns, including ended October ones, despite the "this month" label (defect D8). Per campaign, spend − rewardPaid equals the delivered value `budget × progress × 0.88`. The 0.88 factor is the prototype's delivery model; there is no separate statement-period filtering.

**Left: box "Statement by market"**, a table with columns "Country" | "Impressions" | "Delivery charged" | "Phoenix share". The last column is bold. One row per market, in the order Nigeria, Kenya, Ghana, Tanzania, Senegal:

- Impressions = `fmt(Σ imp)` of that market's campaigns
- Delivery charged = `usd(Σ (spend − rewardPaid))`
- Phoenix share = `usd(that × SHARE)`

Seed values:

| Country | Impressions | Delivery charged | Phoenix share |
|---|---|---|---|
| Nigeria | 299.6k | $417 | $229 |
| Kenya | 168.5k | $403 | $222 |
| Ghana | 0 | $0 | $0 |
| Tanzania | 0 | $0 | $0 |
| Senegal | 210.6k | $295 | $162 |

There is no totals row. "Delivered × CPM × share" is effectively `Σ(impressions/1000 × CPM)` folded into spend, then multiplied by SHARE.

**Right column:**

- **Box "Share"**: an `.edit` field labelled "Phoenix share of delivery charges", a number input (`step 0.05`, `min 0`, `max 1`, value `0.55`). Sub below: "Share rewards are paid to consumers and are excluded. Applies from the next statement."
  - On `change`, `SHARE` is set and the page re-renders. The Review KPI "Owed to Phoenix" changes too.
  - It applies **immediately to all figures**, not "from the next statement".
  - There is no validation: 1.5 renders "150%" and "Global keeps −$557".
- **Box "Past statements"**: a static table with no header:

  | Period | Amount | Status |
  |---|---|---|
  | Oct 2026 | **$2,140** | Paid |
  | Sep 2026 | **$1,380** | Paid |

**Absent:**

- a statement detail view
- "Mark paid" for settlements
- disputes or adjustments
- download or export
- a statement for the current month (only the live "Owed this month" tile).

**Object model (implied):**

```
SettlementConfig { channelId, phoenixShare: 0..1 }   (single global scalar in prototype)
SettlementStatement { channelId, period: "Oct 2026", amountUsd, status: paid|… }   (static)
SettlementLine (computed) { period, marketCode, impressions, deliveryChargedUsd, channelShareUsd }
```

### 2.5 Rewards ledger

Screenshots:

- `rewards-ledger-default-1280.png`
- `rewards-ledger-topup-1280.png` (after +$500)
- `rewards-ledger-low-balance-1280.png` (after a −$1,500 "top up", which shows the "top up soon" state)

**Header actions:** none.

**KPI strip:**

| Tile | Value | Sub | Fill |
|---|---|---|---|
| "Rewards earned" | `usd(owed)` where `owed = Σ rewardPaid` over all campaigns ($119) | "all campaigns, this month" | 100 |
| "Sent via aggregator" | `usd(owed × 0.97)` ($116) | "3% still queued" (fixed text) | 97 |
| "Aggregator balance" | `usd(AGG_BAL)` (start $1,240) | if `AGG_BAL < 500`: "top up soon"; else "about {round(AGG_BAL / (owed/30))} days at current rate" (312) | min(100, AGG_BAL / 2000 × 100) |
| "Points issued" | `fmt(Σ sClaims × 10)` (16.4k) | "10 per successful share" | 100 |

**Left: box "By campaign".** Table columns:

| Column | Content |
|---|---|
| "Campaign" | **{campaign name}** (internal name) |
| "Advertiser" | workspace name |
| "Successful shares" | `fmt(sClaims)` |
| "Per share" | "{local symbol}{reward}" (e.g. ₦50, KSh10, F100) |
| "Owed" | **{usd(rewardPaid)}** |
| "Recharged on invoice" | pill "Paid" (green) if the campaign is ended, else "Open" (blue; the `issued` status) |

- Only campaigns with `sClaims > 0` are listed, ended ones included.
- No empty state; the table body would be empty.
- Rows are not clickable.

Seed rows:

| Campaign | Advertiser | Successful shares | Per share | Owed | Recharged on invoice |
|---|---|---|---|---|---|
| Buy 2 get 1 — November | Kola Bright | 205 | ₦50 | $7 | Open |
| August multipack 15% off | Kola Bright | 211 | ₦0 | $0 | Paid |
| Supa10 Jackpot — Kenya | MediaSpec (agency) | 416 | KSh10 | $32 | Open |
| Foot Gabal-Lena — Senegal | MediaSpec (agency) | 162 | F100 | $27 | Open |
| Kwik ₦1m draw | MediaSpec (agency) | 290 | ₦50 | $9 | Open |
| Jackpot 10 — Guinea-Bissau | MediaSpec (agency) | 248 | F100 | $40 | Paid |
| KSh 50 cashback on first top-up | Pesa Link | 112 | KSh5 | $4 | Open |

At 1280 wide this table's width pushes the right column past the page's content edge (visible in the screenshot).

**Right column:**

- **Box "Top up aggregator"**: sub "Reloadly prepaid balance pays the airtime. Global funds it; advertisers are recharged on their invoice." Field "Amount (USD)" (number input, default `1000`, `step 100`) and a full-width "Top up" button (`.btn.p`).
  - Click: `AGG_BAL += amount`, toast "Aggregator topped up", page re-renders.
  - No confirmation and no validation; **negative amounts are accepted** (that is how the low-balance screenshot was produced).
  - No top-up history.
- **Box "Fraud checks"**: three static rows (`.tog` rows), each a rule (13 px), a small ink3 action line, and a green "Approved" pill on the right:
  1. "Same device claims own share" / "blocked"
  2. "More than 5 rewards per sharer per day" / "held for review"
  3. "Phone number reused across 3+ sharers" / "held for review"

  The rows are not interactive. The "Approved" pill presumably means "rule active"; see Open questions.

**Absent:**

- individual payout entries (per sharer or per MSISDN)
- payout status or retry
- a queue of held rewards to approve or reject
- per-sharer caps editing (caps live on the workspace Rewards page: "Max successful shares per sharer per day" 5, "Max rewards as % of campaign budget" 20, "Points per successful share" 10)
- aggregator transaction history.

**Object model (implied):**

```
AggregatorAccount { provider: "Reloadly", balanceUsd }
RewardLedger (computed per campaign) { campaignId, workspaceId, successfulShares, rewardPerShareLocal, owedUsd, rechargeStatus: open|paid }
Reward accrual (from code): per successful share = reward (local) / fx → USD, capped at budget × rewardCap% (rewardCap = 20)
Points: 10 per successful share (constant)
FraudRule { name, action: blocked|held for review, status }   (static)
```

### 2.6 Phoenix API

Screenshot: `api-default-1280.png` (full page). The page is **documentation only**. It has zero buttons, links or inputs: no key management, no sandbox console, no event log.

**Left column (three boxes):**

**Box "1 · Offers out".** Sub: "Phoenix polls this every 15 minutes per country and renders the cards in More → Offers. Only approved, in-flight campaigns are returned, ordered by placement then remaining budget."

Code block, verbatim (syntax colours: method and comment lines `#8A90A0`, keys `#8BB4FF`, strings `#9FE3A3`, numbers/booleans/null `#FFC98B`, on `#14171D`):

```
GET https://api.offergrid.example/v1/offers?country=KE&channel=phoenix
Authorization: Bearer <channel key>

{
  "country": "KE", "generated_at": "2026-11-07T10:00:00Z", "ttl_seconds": 900,
  "offers": [{
    "id": "cmp_8f3a", "placement": "featured", "brand": "777Bet",
    "headline": "Supa10 Jackpot — KSh 5M kwa buku tu",
    "description": "Predict 10 matches for KSh 100…", "category": "betting",
    "creative": { "image": "https://cdn…/supa10.jpg", "video": null, "color": "#0b2a6b" },
    "cta": { "label": "Cheza Hapa", "type": "link", "url": "https://777bet.co.ke/?og=cmp_8f3a" },
    "flags": { "sponsored": true, "age_18": true },
    "share": { "enabled": true, "reward_label": "Earn KSh 10 airtime" },
    "ends_at": "2026-11-16T23:59:59+03:00"
  }]
}
```

**Box "2 · Events in".** Sub: "Phoenix's SDK batches events and posts them at most every 60 seconds. We de-duplicate on `session_id + offer_id + type` per hour. Impressions must meet 50% in view for 1 s."

```
POST https://api.offergrid.example/v1/events
Authorization: Bearer <channel key>   Idempotency-Key: <uuid>

{ "channel": "phoenix", "events": [
  { "type": "impression", "offer_id": "cmp_8f3a", "placement": "featured", "country": "KE", "session_id": "anon_…", "ts": "…" },
  { "type": "open",       "offer_id": "cmp_8f3a", … },
  { "type": "claim",      "offer_id": "cmp_8f3a", "claim_code": "PHX-3F9K", … },
  { "type": "share",      "offer_id": "cmp_8f3a", "token": "PHX-K4Q7-7A2", "via": "whatsapp", "msisdn_hash": "sha256…" },
  { "type": "share_open", "token": "PHX-K4Q7-7A2", "session_id": "anon_friend…" },
  { "type": "share_claim","token": "PHX-K4Q7-7A2", "session_id": "anon_friend…" }
]}

→ 202 Accepted  { "received": 6, "duplicates": 0 }
```

**Box "3 · Share token"** (prose only): "Minted by us when Phoenix calls `POST /v1/share` with the offer and the sharer's OTP-verified number. Format `PHX-XXXX-XXX`, 7 alphanumerics, no ambiguous characters, valid to the campaign end date. The share link is `https://og.link/<token>`; it deep-links into Phoenix if installed, otherwise shows an install prompt (phase 2: our own offers page). One sharer earns at most 5 rewards per day per campaign; the friend's session must be a different device."

**Right column (four boxes):**

**Box "Auth and limits"** (two-column table, no header):

| | |
|---|---|
| Auth | Bearer key per channel, rotated quarterly |
| Rate limit | 600 req/min on events, 60 req/min on offers |
| Payload | ≤ 500 events per POST, ≤ 1 MB |
| Retry | Idempotency key; 5xx retry with backoff |
| Latency SLO | p95 < 300 ms offers, < 500 ms events |
| Environments | `api-sandbox` and `api` |

**Box "Claim codes":** "Phoenix requests one at claim time: `POST /v1/claims` → `{ "code": "PHX-3F9K", "valid_until": … }`. One per session per offer per day. Not validated at the till in MVP; the brand honours them."

**Box "Webhooks to Phoenix":** "`offer.approved`, `offer.paused`, `offer.ended` so Phoenix can refresh before the next poll."

**Box "Boomplay":** "Same contract with `channel=boomplay` and its own key. No changes on the advertiser side."

Inline code uses `.tok`: monospace 12 px on `#F6F7F9`, radius 6, padding 2px 6px.

**Object model implied by the contract:**

```
ApiKey { channelId, environment: api-sandbox|api, secret, rotatedAt (quarterly) }
Offer (wire) { id "cmp_…", placement, brand, headline, description, category, creative{image,video,color}, cta{label,type,url}, flags{sponsored,age_18}, share{enabled,reward_label}, ends_at }
Event { type: impression|open|claim|share|share_open|share_claim, offer_id, placement, country, session_id, ts, claim_code?, token?, via?, msisdn_hash? }
ShareToken { token "PHX-XXXX-XXX", offerId, sharerMsisdnHash, deviceId, validUntil = campaign end }
ClaimCode { code "PHX-3F9K", offerId, sessionId, validUntil }
Webhook topics: offer.approved, offer.paused, offer.ended
```

### 2.7 Consolidated reference data (constants in the prototype)

**Markets (`MKT`):**

| Code | Name | Currency | Symbol | FX per USD |
|---|---|---|---|---|
| NG | Nigeria | NGN | ₦ | 1550 |
| KE | Kenya | KES | KSh | 129 |
| GH | Ghana | GHS | GH₵ | 15.5 |
| TZ | Tanzania | TZS | TSh | 2600 |
| SN | Senegal | XOF | F | 610 |

**Placements (`PL` / `PLDESC`):**

| Key | Label | Description |
|---|---|---|
| card | "Wall card" | "A card in the Offers grid" |
| featured | "Featured tile" | "Full-width tile at the top of the wall" |
| video | "Video" | "6–15s clip in the featured slot" |
| splash | "Splash" | "Full-screen on Phoenix open, once a day" |

**Categories:** "Food & drink", "Personal care", "Banking & fintech", "Telecom & data", "Betting", "Travel", "Retail".

**Tile colours (swatches):** `#FF5A1F`, `#0F766E`, `#2B5FD9`, `#7C3AED`, `#B45309`, `#BE185D`, `#111827`.

**Channels:** "Phoenix Browser" (live), "Boomplay" (not live).

**Constants:**

- `SHARE = 0.55`
- `AGG_BAL = 1240` (USD; Reloadly)
- expected open rates: card .036, featured .055, video .07, splash .09
- reward cap 20% of budget
- 10 points per successful share
- default credit for a new workspace $500

**Status labels (`ST`):**

| Key | Label |
|---|---|
| live | "Live" |
| review | "In review" |
| rejected | "Rejected" |
| ended | "Ended" |
| paused | "Paused" |
| scheduled | "Scheduled" |
| paid | "Paid" |
| due | "Due" |
| overdue | "Overdue" |
| issued | "Open" |
| pending | "Pending approval" |
| approved | "Approved" |

`declined` and `draft` have no label, so the raw key is shown.

**Seed campaigns** (workspace → campaign name / headline / market / placement / status):

- Kola Bright:
  - "Buy 2 get 1 — November" / "Buy 2 bottles, get 1 free" / NG / featured / live
  - "August multipack 15% off" / "15% off 6-packs" / NG / card / ended
  - "December draw teaser" / "Win a year of Kola Bright" / NG / video / review
- MediaSpec (agency):
  - "Supa10 Jackpot — Kenya" (777Bet) / KE / featured / live
  - "Foot Gabal-Lena — Senegal" (Pariez Cash) / SN / card / live
  - "Weekend cashback — Tanzania" (777Bet Metro) / "Pata 10% ya mikeka uliyopoteza" / TZ / splash / review
  - "Kwik ₦1m draw" (Kwik Bank) / NG / card / paused
  - "Jackpot 10 — Guinea-Bissau" / SN / card / ended
- Pesa Link:
  - "KSh 50 cashback on first top-up" / KE / card / live
- SunFresh Juices: none (workspace pending).

**Embedded creatives** (base64 JPEGs): `supa10`, `metro`, `jackpot10`, `pariez`.

**Number formatting helpers (reproduce exactly):**

- `fmt(n)`: ≥1,000,000 → `(n/1e6).toFixed(2)+"M"` (e.g. "1.11M"); ≥1,000 → `(n/1e3).toFixed(1)+"k"` (e.g. "678.6k"); else the rounded integer.
- `usd(n)`: rounded to whole dollars, thousands separators, negative with U+2212: "$1,115", "−$557".
- `loc(n, market)`: USD × fx, rounded, symbol prefix with no space: "₦12,384", "KSh774".
- `pct(a, b)`: `(a/b×100).toFixed(1)+"%"`, or "0%" when b = 0.
- Dates `fd()`: en-GB day + short month, "16 Nov". Days left: `ceil((end − now)/1 day)`, floored at 0.

---

## 3. Defects and quirks observed (decide before rebuilding; do not copy blindly)

- **D1. Live-now card click.** `rAReview` sets an `onclick` that would switch into the campaign's workspace. `go()` then calls `bindGo()`, which overwrites it with a plain "open detail". Result: Global opens the detail while still in Global mode. The breadcrumb names the last-selected workspace (wrong owner), the nav has no active item, and budget saves check credit against the wrong workspace.
- **D2. Stale counts.** Approve, Reject, Approve workspace and Decline re-render only the list. The sidebar "Review" badge and the bell count stay stale until you navigate. The bell panel content is computed on open, so it can say "Nothing new." under a red "3".
- **D3. Native dialogs.** Reject uses `prompt()`. Workspace-side "End campaign now" uses `confirm()` ("End now? Unspent budget is released from your credit."). Neither is styled. An empty reason is accepted.
- **D4. Declined workspaces.**
  - There is no label or CSS, so the pill renders as lowercase "declined" with an ink dot.
  - There is no notification to the owner.
  - The banner disappears.
  - Their queued campaigns lose the "approve it first" warning, and Approve becomes enabled. Approving one works (it became "scheduled").
- **D5. Initials helper.** `ini()` takes the first character of each word, so "MediaSpec (agency)" gives the logo tile "M(" (visible in `advside-rejected-detail-1280.png`), and a brand like "777Bet" gives "7".
- **D6. Rejected campaign detail.** The chart subtitle shows "Scheduled." (fall-through).
- **D7. Rates apply retroactively.** Editing a rate changes the CPM shown on existing campaigns and the rate Simulate-a-day delivers at, despite "Changes apply to new campaigns only."
- **D8. "This month" is all-time.** Delivery charged, Owed this month and Rewards earned sum all campaigns, including ones that ended in October. Unbilled uses a hard-coded "Nov" string match.
- **D9. No validation on Platform inputs.** Credit limit accepts any number. Phoenix share accepts values above 1 (shows 150% and a negative "Global keeps"). Top-up accepts negative amounts.
- **D10. Inputs that never re-render.** The credit-limit edit leaves the Advertisers table unchanged (no confirmation that it saved apart from the toast).
- **D11. Bell items are not clickable** and there is no read or unread state. The count is the total list length.
- **D12. No Escape handling.** The preview modal closes via "Close" or a backdrop click only. There is no focus trap.
- **D13. Splash and video in the preview** render as a static featured tile. There is no full-screen splash and no video player.
- **D14. Horizontal overflow at 390 wide** on every Platform page. Document width: Review 465 px, Advertisers 902, Rates 576, Settlement 450, Rewards ledger 632, Phoenix API 1013. Tables and `pre` blocks have no scroll container, and the Review `.q` grid keeps its 3 columns.

---

## 4. App shell

### 4.1 Layout skeleton

```
.app (CSS grid: 248px | 1fr, min-height 100vh)
├── aside.side (white, right border #E6E8EE, padding 16px 12px, sticky top 0, height 100vh, own scroll, flex column)
│   ├── .brand  [logo tile 34×34 radius 10] [title 15px/700 + subtitle 11px ink3]
│   ├── nav#nav  (group labels + buttons)
│   └── .foot  "Demo · data resets on reload"  (11px ink3, pushed to bottom)
└── .main
    ├── header.top (64px, white, bottom border, sticky top 0, z 20, padding 0 28px, gap 14)
    │   ├── .search  (fake search field)
    │   ├── button.bell  (🔔 + red count)
    │   ├── button.wsbtn  "▦ Workspaces"
    │   ├── .who  [avatar circle] [workspace <select>]   (left border, padding-left 14)
    │   └── .notif  (bell dropdown panel)
    ├── .banner  (conditional)
    └── .wrap  (page content, padding 22px 32px 60px, max-width 1240px)
#toast (fixed), #mPrev (modal)
```

### 4.2 Sidebar

**Logo block:** described in 1.3. Global: "OG" on orange, "OfferGrid" / "Platform console". Workspace: initials on ink, workspace name / "{type} workspace · {country}".

**Group labels** (`.grp`): 11 px, 600, uppercase, letter-spacing 0.12em, ink3, padding 16px 10px 6px. The source labels are "Campaigns", "Growth", "Money", "Organisation", "Platform", and CSS uppercases them.

**Nav items** (buttons; icon + label + optional count):

| Group | Label | Icon (inline SVG, 18 px, stroke 1.8, round caps) | Count badge |
|---|---|---|---|
| CAMPAIGNS | Campaigns | house | workspace campaigns with status live/paused/review/scheduled (Kola: 2) |
| CAMPAIGNS | New campaign | plus in circle | none |
| GROWTH | Sharing | share (three nodes) | none |
| GROWTH | Rewards | gift | none |
| MONEY | Billing & credit | credit card | none |
| MONEY | Invoices | document | count of due + overdue invoices (MediaSpec 1, Pesa 1) |
| ORGANISATION | People | two people | none |
| ORGANISATION | Workspace | cog | none |
| ORGANISATION | Notifications | bell | none |
| PLATFORM | Review | checkbox-tick | campaigns in review + pending workspaces (3) |
| PLATFORM | Advertisers | 2×2 squares grid | none |
| PLATFORM | Rates | price tag | none |
| PLATFORM | Phoenix settlement | globe | none |
| PLATFORM | Rewards ledger | table/ledger | none |
| PLATFORM | Phoenix API | code brackets `</>` | none |

**Item states:**

- Default: transparent, ink2 `#5B6170`, 14 px / 500, padding 9px 10px, radius 9, gap 10.
- Hover (not current): bg `#F6F7F9`, ink.
- **Current** (`aria-current="page"`): bg `#FF5A1F`, white, 600. "Campaigns" is also current on a campaign detail page.
- Count badge: pushed right, 11 px, bg `#F6F7F9`, ink2, pill, padding 1px 7px. On the current item: bg `rgba(255,255,255,.25)`, white. A count of 0 is hidden.
- In Global mode, a campaign detail page has no current item.

Clicking a PLATFORM item while in a workspace switches to Global (1.2).

### 4.3 Topbar

**Search** (`.search`):

- A **static div**, flex 1, max-width 520, centred.
- Styling: bg `#F6F7F9`, 1 px border, radius 12, padding 9px 14px, ink3.
- Content: "🔍" emoji, the text "Search campaigns, invoices, people…", and a `kbd` "⌘K" (white, 1 px border, radius 6, 11 px).
- **It is not an input.** It has no click handler, and **⌘K / Ctrl+K do nothing** (no key listener exists anywhere).
- There is no search palette, no result groups and no searchable index. The placeholder implies campaigns, invoices and people (see Open questions).
- Hidden at ≤ 980 px.

**Bell** (`.bell`):

- 38 × 38, radius 10, transparent (hover bg `#F6F7F9`), content "🔔".
- Count badge `i`: absolute top 4 / right 4, bg red `#C53030`, white 10 px / 700, pill, min-width 17, height 17. Hidden when 0.
- Click toggles the panel. Any click outside the bell or panel closes it.

**"▦ Workspaces"** (`.wsbtn`): orange `#FF5A1F` button, white 14 px / 700, radius 11, padding 10px 16px. Behaviour in 1.2.

**Who** (`.who`):

- Avatar circle 34 × 34, bg `#EEEBFD`, text `#6C5CE7`, 12 px / 700; shows the initials described in 1.3.
- Then the borderless `<select>` (600 weight, max-width 190, native chevron) with the five workspace / Global options.

### 4.4 Bell panel (`.notif`)

Layout:

- absolute, right 28, top 60, width 340
- white, 1 px border, radius 14, shadow `0 14px 40px rgba(20,23,29,.14)`, padding 8
- header "Notifications" (rendered uppercase, 11 px / 700, ink3, letter-spacing 0.1em)
- items: padding 10px 12px, radius 9, hover bg `#F6F7F9`; **bold title** + `small` line "{sub} · {time}" (11 px ink3). An empty sub renders as "· now".

**Global items** (`shots-global/shell-bell-global-1280.png`):

- per campaign in review: "**{campaign name} needs review**" / "{workspace name} · now". Seed: "December draw teaser needs review" / "Kola Bright · now"; "Weekend cashback — Tanzania needs review" / "MediaSpec (agency) · now".
- per pending workspace: "**{workspace} wants to join**" / "New {type lowercased} workspace · 6h ago". Seed: "SunFresh Juices wants to join" / "New brand workspace · 6h ago".
- empty: "Nothing new." (ink3) (`shell-bell-empty-1280.png`).

**Workspace items (seed):**

- **Kola Bright:**
  - "Buy 2 get 1 is delivering faster than planned" / "budget will finish ~3 days early · 2h ago"
  - "December draw teaser is in review" / "Global usually decides within one working day · 1d ago"
- **MediaSpec (agency):**
  - "Weekend cashback — Tanzania is in review" / "· 3h ago"
  - "INV-0044 is due in 5 days" / "$3,610 · pay by bank transfer · 1d ago"
  - "Supa10 Jackpot: 1,000th share reward paid" / "KSh 10 airtime each · 2d ago"
- **Pesa Link:**
  - "INV-0046 is overdue" / "campaigns pause if unpaid by 15 Nov · 9d ago"
- **SunFresh Juices:**
  - "Your workspace is awaiting approval" / "Global checks new advertisers within one working day · 6h ago"

New notifications are prepended with time "now".

**Clicking an item does nothing.**

### 4.5 Banner (`.banner`)

- Full-width strip under the topbar: bg `#FFF7F3`, bottom border `#FFD9C8`, padding 9px 28px, 13 px, text `#7A3412`, leading bold word in orange `#FF5A1F`.
- Copy: in 1.3 (Global, pending workspace). Hidden otherwise.

### 4.6 Page header pattern

Breadcrumb → `h1` + lead sentence → right-aligned actions (details in 2.0).

**Breadcrumb formats:**

- Global: "Platform › {Page}"
- workspace pages: "{Workspace} › {Page}" or "{Workspace} › {Group} › {Page}", e.g. "Pesa Link › Money › Billing & credit"
- campaign detail: "{Workspace} › Campaigns › {campaign name}", where "Campaigns" is a blue link back.

Only the Campaigns home has a greeting `h1` ("Good morning" before 12:00, "Good afternoon" before 18:00, else "Good evening", then ", {Owner first name}").

**Header action buttons on Platform pages:** only Review has one ("Simulate a day").

### 4.7 Footer / demo marker

The sidebar footer reads "Demo · data resets on reload" (11 px ink3). There is no page footer.

### 4.8 Toast

- Fixed bottom 26 px, centred.
- bg ink `#14171D`, white 13 px, pill, padding 11px 18px, max-width 90vw.
- Fades in over 0.25 s and auto-hides after **2.2 s**. One at a time; a new toast replaces the old.
- Every toast string on Global screens is quoted in section 2.

### 4.9 Behaviour at 390 wide (`@media (max-width: 980px)`)

See `shell-workspace-390.png`, `shell-workspace-top-390.png`, `shell-bell-390.png`, `review-default-390.png`, `review-preview-390.png`, `advertisers-default-390.png`.

- The grid becomes a single column. The **sidebar is no longer sticky**: it renders as a full-height block at the top of the page with the complete nav (about 830 px tall in a workspace) **before** the topbar and content. There is no hamburger or drawer.
- Topbar padding becomes 0 14px, gap 8. **Search is hidden.** The bell, "Workspaces" button and who/select remain; "▦ Workspaces" wraps onto two lines. The topbar stays sticky once scrolled to.
- `.wrap` padding becomes 18px 14px 40px.
- These layouts collapse to one column: `.two`, `.two.eq`, `.prev`, `.form`, `.steps`, hero. `.stats` becomes 2 columns, `.opts` 2 columns.
- KPI tiles stack one per row (auto-fill 240 px min).
- The bell panel sits at right 10 px (left edge ≈ 40 px; width stays 340).
- **Not adapted:** Review `.q` rows keep 3 columns, so the action buttons overflow to the right. Tables and code blocks overflow the viewport (D14).

---

## 5. Consumer and Phoenix surfaces

The prototype has **one** consumer-facing surface: the "On Phoenix" phone preview modal.

**There is none of the following:**

- share landing page (`og.link/<token>`)
- claim-code view
- full-screen splash
- video player
- install prompt
- OTP screen
- consumer rewards wallet.

These are described only in API copy (2.6) and in Sharing copy on the advertiser side.

### 5.1 "On Phoenix" phone preview modal (`#mPrev`)

Screenshots:

- `review-preview-video-1280.png`: video campaign as the featured tile
- `review-preview-splash-1280.png`: splash campaign
- `phoenix-preview-featured-1280.png`: featured campaign
- `phoenix-preview-card-withfeatured-1280.png`: a wall card with another brand featured
- `phoenix-preview-card-nofeatured-1280.png`: a wall card in a market with no featured offer
- `review-preview-390.png`

**Opened from:**

- Review → "Preview" (Global)
- campaign detail → "See it on Phoenix"
- New campaign → "See it on Phoenix" (a draft)

**Modal shell:**

- backdrop `rgba(16,18,24,.5)` fixed full-screen, z 40
- panel white, radius 18, padding 24, width min(760px, 94vw), max-height 92vh, scrolls
- `h3` "On Phoenix"; sub "Your card, outlined, among the offers live in this country right now."
- 2-column grid `280px 1fr`, gap 24:
  - left: the phone
  - right: paragraph (ink2, line-height 1.6): "The Phoenix user opens Offers, taps your card and either takes a claim code or is sent to your link. If they share it, the friend lands on the same offer with a token; when the friend claims, the sharer earns airtime and points. Each step shows up in your report within the hour." Then "Close" (`.btn.d`).
- Closes on "Close" or a backdrop click. No Escape.

**Phone frame:**

- `.phone` 260 × 480, 7 px border `#101218`, radius 28, screen bg `#F5F6F8`, overflow hidden
- notch 80 × 16 `#101218`, bottom radius 10
- the screen scrolls (scrollbar hidden), padding-top 20.

**Screen content, top to bottom:**

1. URL pill: "phoenix://offers" (10 px ink3 on `#EDEFF3`).
2. Header: "Offers" (17 px bold) + country name right (10 px ink3).
3. Category chips (10 px pills): "All" (active: ink bg, white), "Food & drink", "Personal care", "Banking & fintech". These are the first three categories, they overflow and they are not clickable.
4. **Featured tile** (`.feat`, radius 11):
   - Which campaign it shows: if the previewed campaign's placement is featured, video or splash, it is the previewed campaign. Otherwise it is the first other *live* campaign in the same market whose placement is featured or video. If there is none, no tile is shown.
   - Visual: the creative image (max-height 100, cover) or a 70 px colour block with brand initials.
   - Caption on white: `small` 9 px "{Featured|Splash} · {brand} · Sponsored{ · 18+}" and `b` 11 px headline.
   - Outlined 2 px orange when it is the previewed campaign.
5. **Wall grid** (`.pg`, 2 columns, gap 6):
   - Contents: the previewed campaign (if it is not the featured one) followed by up to five other *live* campaigns in the same market.
   - Each `.pc`: white, radius 9, 1 px border; 50 px tile (image or colour + initials); "{brand} · Sponsored" (9 px ink3); headline (10 px / 600; "Your headline" if empty).
   - The previewed card has `.mine`: 2 px `#FF5A1F` outline, offset 1.

There is no tap interaction inside the phone.

### 5.2 "Simulate a day"

**Location:**

- Global: Review header.
- Workspace side: Campaigns home and Sharing headers.
- Button style `.btn.g`.

**Effect** (all campaigns platform-wide, regardless of where clicked). For every **live** campaign:

1. If budget is exhausted, it becomes `ended` with notification "{name} ended" / "budget fully delivered".
2. Otherwise:
   - `day = min(budget left, budget / max(1, days left) × random(0.8–1.3))`
   - impressions `= day × 0.88 / CPM × 1000` (current `RATES`)
   - opens `= impressions × expected open rate × random(0.85–1.15)`
   - claims `= opens × 0.33`
   - shares `= opens × 0.09`
   - friend opens `= shares × 2.2`
   - friend claims `= friend opens × 0.3`
   - reward `= min(remaining cap, friend claims × reward / fx)`
   - spend `+= day × 0.88 + reward`
   - the 14-day chart shifts left and appends today
   - channel split WhatsApp 62% / X 14% / Facebook 16% / SMS 8%
3. Ledger lines are prepended on the owning workspace: "{d MMM}", "{campaign name} — delivery", −amount. If reward > $0.50, also "{campaign name} — share rewards".
4. The aggregator balance is reduced by the reward.
5. If spend reaches the budget or the end date is today, the campaign becomes `ended` with notification "{name} ended" / "{fmt(imp)} impressions · {open rate} open rate".
6. If the workspace's credit in use exceeds its limit, the campaign becomes `paused` with notification "{name} paused — credit limit reached" / "pay an open invoice or ask Global to raise the limit".

Then:

- scheduled campaigns whose start date ≤ now become live
- **the clock does not advance**, so scheduled campaigns with a future start never go live by simulation
- toast "Simulated one day on Phoenix — delivery, shares, rewards and statements updated"
- the page re-renders (badges refresh).

**Observed effect on Global numbers after one day** (`review-after-simulate-1280.png`):

| Figure | Before | After |
|---|---|---|
| Impressions | 678.6k | 754.7k |
| Charged for delivery | $1,115 | $1,282 |
| Rewards | $119 | $135 |
| Owed to Phoenix | $613 | $705 |
| Aggregator balance | $1,240 | ≈ $1,224 |

After about 13 clicks every seeded live campaign is ended, "Live on Phoenix" reads 0 and "Live now" is empty.

---

## 6. Design system

### 6.1 Tokens (`:root`)

| Token | Value | Use |
|---|---|---|
| `--ink` | `#14171D` | Primary text, dark buttons, workspace logo tile, toast, code-block bg |
| `--ink2` | `#5B6170` | Secondary text, lead paragraphs, nav items, labels |
| `--ink3` | `#9AA0AE` | Tertiary text, group labels, sub-text, table headers, breadcrumb root, chart labels |
| `--bg` | `#F6F7F9` | Page background, default button bg, chips, kv cells, hover fills |
| `--card` | `#fff` | (declared; cards use literal `#fff`) |
| `--line` | `#E6E8EE` | Borders, dividers, input borders, switch off |
| `--line2` | `#F0F1F4` | Progress-bar tracks |
| `--phx` | `#FF5A1F` | Brand / Phoenix orange: primary buttons, active nav, Workspaces button, progress fills, "today" bar, funnel, focus outline, "your card" outline |
| `--phx2` | `#FFF1EB` | Pressed pill / selected option tint |
| `--phx3` | `#FFD9C8` | Banner border |
| `--grn` / `--grn2` | `#0E9F6E` / `#E5F6EF` | Live, Paid, Approved; KPI dot; hero pace bar; switch on; positive (credit) money in statements |
| `--amb` / `--amb2` | `#B7791F` / `#FCF3DF` | In review, Paused, Due, Pending approval; `.warn`; outstanding amounts; "inventory TBC" badge |
| `--red` / `--red2` | `#C53030` / `#FDE8E8` | Rejected, Overdue; bell count; rejection note; "End campaign now" text; credit-limit-reached box |
| `--blu` / `--blu2` | `#2B5FD9` / `#E9EFFC` | Scheduled, Open (issued invoice / recharge open); links; people avatars |
| `--pur` / `--pur2` | `#6C5CE7` / `#EEEBFD` | User avatar circle; share-channel bars (`.hbar`) |
| `--r` | `14px` | Card radius |
| `--sb` | `248px` | Sidebar width |

**Other literal colours:**

- banner bg `#FFF7F3`, banner text `#7A3412`
- cover / hero art placeholder `#0b0f1a`
- phone frame and notch `#101218`, phone screen `#F5F6F8`, phone URL pill `#EDEFF3`
- table row hover `#FAFBFC`
- chart past bars `#DADDE4`
- code-block text `#E6E8EE`; syntax colours: keys `#8BB4FF`, strings `#9FE3A3`, numbers `#FFC98B`, comment and method `#8A90A0`
- age badge `#111`
- overlays `rgba(0,0,0,.55)`
- card status pill on covers `rgba(255,255,255,.94)`
- modal backdrop `rgba(16,18,24,.5)`

There is **no dark mode** (`color-scheme: light`).

### 6.2 Colour meaning

| Meaning | Colour |
|---|---|
| Live / Paid / Approved / healthy | green `#0E9F6E` on `#E5F6EF` |
| In review / Paused / Due / Pending approval / warnings / money owed (outstanding) | amber `#B7791F` on `#FCF3DF` |
| Rejected / Overdue / alerts | red `#C53030` on `#FDE8E8` |
| Scheduled / Open (issued) | blue `#2B5FD9` on `#E9EFFC` |
| Ended | ink3 `#9AA0AE` on `#F6F7F9` |
| Draft | ink2 `#5B6170` on `#F6F7F9` |
| Brand / action / progress / Phoenix | orange `#FF5A1F` |
| Money | No dedicated colour. Amounts are ink. Credits (payments in) are green in statements. Negatives use U+2212 "−". Outstanding is amber on Advertisers. |
| Rewards | No dedicated colour. Reward recharge status uses the Open (blue) and Paid (green) pills. Share-channel bars are purple `#6C5CE7`. |

### 6.3 Typography

- **Font stack:** `-apple-system, "Segoe UI", system-ui, Helvetica, Arial, sans-serif`. Base 14 px, line-height 1.45, `-webkit-font-smoothing: antialiased`. No web fonts are loaded.
- **Monospace:** `ui-monospace, Menlo, Consolas, monospace`, used for code, tokens and the anonymised phone numbers.

| Role | Size / weight / line-height / tracking | Colour |
|---|---|---|
| Page `h1` (`.head h1`) | 28px / 700 / 1.1 / −0.03em | ink |
| Hero `h2` (campaign home) | 26px / 700 / 1.15 / −0.025em | ink |
| KPI value (`.mc .v`) | 30px / 700 / 1 / −0.03em | ink |
| Hero stat (`.stats b`) | 24px / 700 / 1 / −0.02em | ink |
| Estimate number (`.est b`) | 28px / −0.025em | ink |
| Section `h3` (`.sect h3`) | 17px / 700 | ink |
| Box `h3` | 16px / 700 | ink |
| Card value (`.cc .row b`) | 16px / 700 | ink |
| Brand title (`.brand b`) | 15px / 700 / −0.01em | ink |
| Body, nav, buttons | 14px (nav 500, buttons 700, current nav 600) | ink / ink2 |
| KPI title (`.mc .t`), card title | 14px / 600–700 | ink |
| Lead (`.head p`) | 14px / 400 / 1.5, max 62ch | ink2 |
| Table, form labels, sub-text, breadcrumb, banner, pill text, `.q p` | 13px (labels and `th` 600) | ink2 / ink3 |
| Small: KPI footer, stat labels, status pills, tags, warnings, card meta | 12px (status pills 600) | various |
| Micro: group labels (uppercase, 0.12em, 600), count badges, brand subtitle, footer, kv labels | 11px | ink3 |
| Phone-preview text | 9–11px (header 17px) | |

### 6.4 Spacing, radii, shadows, motion

- **Spacing values used:** 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32 px. Typical pattern:
  - card padding 20
  - KPI tile padding 18/20/14
  - grid gap 16 (tiles, cards), 22 (two-column layouts), 14 18 (forms)
  - block bottom margins 18 (boxes), 22 (header), 24 (KPI grid), 28 (hero, card grid)
- **Radii:**
  - 14 (`--r`: cards, boxes, tiles, bell panel)
  - 20 (hero)
  - 18 (modal)
  - 28 (phone)
  - 12 (search, `pre`, `.est`, `.step`)
  - 11 (buttons, `.opt`, `.drop`, phone featured tile)
  - 10 (logo tile, bell button, `.kv` cells)
  - 9 (nav items, small buttons, inputs, review cover, phone cards)
  - 8 (`.warn`)
  - 7 (inline table inputs)
  - 6 (`kbd`, `.tok`)
  - 4 (chart bars `rx`)
  - 999px (pills, badges, switch, toast)
  - 50% (avatars)
- **Shadows:** only two.
  - Card hover: `0 10px 26px rgba(20,23,29,.08)` + `translateY(-2px)`.
  - Bell panel: `0 14px 40px rgba(20,23,29,.14)`.
- **Motion:**
  - card hover transform/shadow 0.12 s
  - switch knob 0.15 s
  - toast opacity 0.25 s
  - nothing else animates.

### 6.5 Components

See `shots-global/ds-component-sampler-1280.png`. It is a sampler I assembled **from the prototype's own CSS classes** to show every variant side by side; it is not a screen in the prototype.

**Buttons** (`.btn`: radius 11, padding 10px 16px, 14 px / 700, no border, inline-flex, gap 8):

| Variant | Look | Used for |
|---|---|---|
| `.btn` (default) | bg `#F6F7F9`, ink | (rare) |
| `.btn.p` primary | bg `#FF5A1F`, white | Approve, + New campaign, Submit, Save, Top up |
| `.btn.d` dark | bg `#14171D`, white | Open campaign, ← Campaigns, Close |
| `.btn.g` ghost/outline | white, 1 px `#E6E8EE` border, ink | Secondary: Simulate a day, Reject, Preview, Open workspace, Decline, Pause |
| Danger (no class) | `.btn.g` with inline red text `#C53030` | "End campaign now" (there is no red-filled danger button) |
| `.btn.s` small | padding 7px 12px, 13 px / 600, radius 9 | Table and queue actions |
| `.btn.lg` large | padding 14px 22px, 15 px | Hero actions |
| `:disabled` | opacity 0.4, `not-allowed` | Approve on a pending workspace; Add channel rates; Save changes on ended/rejected |

Hover: no button hover styles are defined. Buttons inside `.edit` stack full width (the `.edit` grid stretches them).

**Focus:** the global `:focus-visible` style is a 3 px solid `#FF5A1F` outline, offset 2 px, on every focusable element. Inputs have no other focus style.

**Cards and boxes:**

- `.box`: white, 1 px border, radius 14, padding 20, mb 18. `h3` 16 px; `.sub` 13 px ink3, line-height 1.5, mb 14.
- `.mc` KPI tile: see 2.0.
- `.cc` campaign card: radius 14, cover 118 px, hover lift. Overlays on the cover:
  - status pill top-left on a white 94% background
  - "18+" badge top-right (`#111`, 10 px / 800)
  - placement label bottom-right (black 55%, 10 px)
  
  Body padding 12/14/14. 5 px orange spend bar.
- `.cc.new`: 2 px dashed `#E6E8EE`, transparent, min-height 200, "+ New campaign". Hover turns the border and text orange.
- `.hero`: 300 px art column + body (campaign home; advertiser side).

**Pills and badges:**

- `.st` status pill: pill, padding 4px 10px, 12 px / 600, with a 7 px dot in `currentColor`. Colours per the table in 6.2. `.st-declined` is undefined.
- `.pill` filter / segmented chip: white, 1 px border, 13 px / 600 ink2, padding 7px 14px, with a count `i` (11 px ink3). Pressed (`aria-pressed=true`): bg `#FFF1EB`, border and text `#FF5A1F`. Used as the campaign filters (advertiser side) and as the channel indicators (Rates). **There are no tab components.**
- `.tagp`: bg `#F6F7F9`, 12 px ink2, padding 3px 9px, pill (Review metadata).
- `.warn`: amber text on amber tint, radius 8, padding 8px 10px, 12 px.
- `.side .cnt`: nav count; `.bell i`: red count; `.soon`: amber "inventory TBC" mini-badge; `.age`: "18+".

**Tables:**

- full width, collapsed, 13 px
- `th`: left, ink3, 600, padding 9px 8px, bottom border, nowrap
- `td`: padding 11px 8px, bottom border (none on the last row), vertical-align middle
- clickable rows (`tr.row`, advertiser side only) hover `#FAFBFC`
- inline number inputs inside tables: 1 px border, radius 7, padding 6px 8px, fixed widths 76 to 96 px
- right-aligned money columns are set inline.

**Inputs:**

- `label.f` (form grid): label 13 px / 600 ink2; control full width, margin-top 5, 1 px `#E6E8EE`, radius 9, padding 10px 11px, white, 400. Textarea min-height 66, vertical resize. Hint `small` in ink3 400.
- `.edit` (stacked side panels): same, padding 9px 11px.
- **No error state styling.** Validation is a single hint line (13 px ink3) beside the submit button, which is disabled until valid.
- Disabled inputs use browser default greying.
- Checkboxes and selects are native.
- `.chk`: checkbox row 13 px ink2.

**Other components:**

- **Option tiles** (`.opt`, placement picker): white, 1 px border, radius 11, padding 12. Pressed: orange border + `#FFF1EB`. Big price 16 px / 800.
- **Swatches**: 26 px circles; pressed has a 3 px ink ring.
- **Upload drop** (`.drop`): 2 px dashed border, radius 11; hover border orange.
- **Switch** (`.sw`): 40 × 22 pill. Off `#E6E8EE`; on green `#0E9F6E`. 16 px white knob slides from 3 to 21 px.
- **Toggle rows** (`.tog`): label + small description left, control right, divider.
- **Modals:** one (`.modal` / `.in`, see 5.1).
- **Drawers:** **none exist** in the prototype.
- **Toast:** see 4.8.
- **Progress / pace bars:**
  - KPI line 3 px orange on `#F0F1F4`
  - card bar 5 px orange
  - hero pace bar 7 px **green** (spend ÷ budget)
  - funnel bars 24 px orange radius 6, width `max(2, value/impressions × 50)%`
  - share-channel bars 10 px purple radius 5
- **Charts:** **hand-drawn inline SVG, no library.**
  - Impressions per day: viewBox 700 × 170, `preserveAspectRatio="none"`, 14 bars, bar width (660/14 − 8), `rx 4`.
  - Past days `#DADDE4`, today `#FF5A1F`.
  - X labels "-13d" … "-1d", "today" (10 px `#9AA0AE`).
  - Native `<title>` tooltip with the `fmt` value.
  - No axes or gridlines.
- **Avatars / initial tiles:**
  - user avatar 34 px circle, purple on lavender
  - people-list avatars 32 px blue on `#E9EFFC`
  - logo tile 34 px radius 10 (orange for Global, ink for workspaces)
  - campaign covers show brand initials in white 800 weight (72 px hero, 34 px card, 22 px review, 14 px phone)
- **Code** (`pre`): bg `#14171D`, text `#E6E8EE`, radius 12, padding 16, 12 px / 1.5 monospace, horizontal scroll. `.tok` for inline code.
- **Key-value cells** (`.kv`): 2-column grid of `#F6F7F9` cells, radius 10, label 11 px ink3, value 14 px bold.
- **Estimate block** (`.est`): `#F6F7F9`, radius 12, big number 28 px, divider rows.
- **Steps** (`.steps`): 3-column cards `#F6F7F9`, numbered orange 24 px circles.
- **Leaderboard** (`.lead`): rank circle, monospace phone, bold value right.
- **Empty states:**
  - `.empty`: centred, 50px 24px padding, ink3, optional `h3` in ink. Review uses "Nothing waiting."
  - bell: "Nothing new."
  - tables: "No charges yet." / "No invoices yet."
  - "No shares yet."
  - home: "Nothing on Phoenix yet" + "Create your first offer. It takes about five minutes."
- **Icons:** inline stroke SVGs (Feather-style, 24 viewBox, stroke 1.8, round caps and joins) in the sidebar only. The topbar uses emoji: 🔍, 🔔, ▦.

---

## 7. Open questions (could not reach, or could not tell)

1. **⌘K search palette.** It does not exist. The search field is static text with no handler or key binding. What should it search (the placeholder says "campaigns, invoices, people") and how should results be grouped, including for Global (workspaces, campaigns across all advertisers)?
2. **Reason codes / request changes.** Review has only Approve, Reject (free text via a native prompt with the default "Terms unclear — say where the offer can be redeemed.") and Preview. There is no structured reason list, no "request changes" state and no reviewer audit trail. Decide whether the rebuild adds codes (the checklist sub-line suggests candidates: real offer, lawful in market, terms clear, link works, licence/approval number, 18+).
3. **Advertiser detail, suspend, terms.** There is no advertiser detail page, no suspend/reactivate, no payment-terms editing (fixed "Net 14") and no account-manager assignment (fixed "Obinna A."). What does Global need here?
4. **Credit requests.** "Request a higher limit" (advertiser side) only toasts "Request sent to Global — usually answered within a working day". Nothing appears on any Global screen. Does Global need an inbox?
5. **Global impersonation.** Entering a workspace as Global is identical to being its Owner: owner initials, no banner, no audit. Should there be a "viewing as Global" indicator and restrictions? Should the PLATFORM nav be hidden from advertisers? (In the prototype every workspace can click into Platform.)
6. **Who marks invoices paid?** "Mark paid" lives on the workspace Invoices page (toast says "(demo)"). In the real product is this Global's reconciliation action?
7. **Rates effective dates.** The copy promises "Changes apply to new campaigns only", but there is no effective-from date, history or campaign rate snapshot, and the prototype applies changes retroactively. FX rates are not editable anywhere, though Billing copy says the rate is "fixed for the month".
8. **Settlement workflow.** There is no "mark paid", no disputes, no statement detail and no export. Past statements (Oct 2026 $2,140 Paid; Sep 2026 $1,380 Paid) are hard-coded. "This month" figures are actually all-time.
9. **Rewards ledger depth.** There are no per-sharer payout entries, no held-reward queue, and no aggregator top-up history. The three fraud-check rows show a green "Approved" pill, and it is unclear whether that means "rule enabled" or something else.
10. **Phoenix API management.** The page is documentation only. There are no API keys (create, rotate, revoke), no sandbox, no event log and no webhook configuration UI. The copy describes "Bearer key per channel, rotated quarterly" and environments `api-sandbox` / `api`.
11. **Consumer surfaces.** These are not in the prototype: share landing page (`https://og.link/<token>`), install prompt, claim-code screen, splash takeover, video playback, OTP verification, consumer rewards/points view. Only the "On Phoenix" phone preview exists.
12. **Boomplay.** The channel pill and "Add channel rates" are inert. The second channel's onboarding flow is unspecified.
13. **Declined workspace lifecycle.** This is undefined: no label, no owner notification, and its campaigns remain approvable.
14. **Notification read state and click-through.** Bell items are inert, and the count is the total, not unread. There is no email template, although toasts say "advertiser emailed" / "owner emailed".
15. **Another file in the source folder.** `demo-sept.html` ("OfferGrid — offer wall buying platform (demo)") sits next to the prototype. It is an older, different demo and was **not** inventoried.

---

## 8. Screenshot index (`shots-global/`, 43 files)

| File | What it shows |
|---|---|
| `shell-workspace-1280.png` | Shell in Kola Bright (full sidebar incl. PLATFORM group, greeting, badges) |
| `shell-global-1280.png` | Shell in Platform (Global): OG tile, Platform-only nav, GL avatar, banner |
| `shell-bell-workspace-1280.png` | Bell panel, Kola Bright |
| `shell-bell-global-1280.png` | Bell panel, Global (3 items) |
| `shell-bell-empty-1280.png` | Bell panel "Nothing new." with stale count 3 (D2) |
| `shell-wsbtn-toast-1280.png` | "▦ Workspaces" click toast |
| `shell-pending-banner-1280.png` | SunFresh (pending) banner + empty home |
| `shell-workspace-390.png` | 390 wide, full page, workspace |
| `shell-workspace-top-390.png` | 390 wide, first screen (sidebar stacked on top) |
| `shell-bell-390.png` | 390 wide, bell panel open |
| `review-default-1280.png` | Review, default (KPIs, New advertisers, 2 campaigns waiting, Live now) |
| `review-preview-video-1280.png` | Preview modal from Review (video campaign) |
| `review-preview-splash-1280.png` | Preview modal from Review (splash campaign) |
| `review-approved-1280.png` | After approving "December draw teaser" |
| `review-rejected-1280.png` | After rejecting "Weekend cashback — Tanzania" (Nothing waiting.) |
| `review-empty-1280.png` | After approving SunFresh too (no New advertisers box) |
| `review-pendingws-1280.png` | Campaign from an unapproved workspace: warning + disabled Approve |
| `review-declined-1280.png` | After declining SunFresh (its campaign's Approve now enabled) |
| `review-after-simulate-1280.png` | After one "Simulate a day" (toast) |
| `review-livecard-detail-1280.png` | Live-now card click: detail opens inside Global with wrong breadcrumb (D1) |
| `review-default-390.png` | Review at 390 (overflowing action column) |
| `review-preview-390.png` | Preview modal at 390 |
| `advside-scheduled-home-1280.png` | Advertiser side after approval: card "Scheduled · Starts 16 Nov" |
| `advside-rejected-home-1280.png` | Advertiser side after rejection: card "Not approved" + reason |
| `advside-rejected-detail-1280.png` | Rejected campaign detail (pill + red reason; "M(" logo, D5) |
| `advside-rejected-bell-1280.png` | Advertiser bell with the rejection notification |
| `advertisers-default-1280.png` | Advertisers table |
| `advertisers-credit-edited-1280.png` | After editing Pesa Link credit to 1000 (toast) |
| `advertisers-declined-1280.png` | SunFresh row with raw "declined" status (D4) |
| `advertisers-open-workspace-1280.png` | "Open workspace" result: Pesa Link as its Owner |
| `advertisers-default-390.png` | Advertisers at 390 (table overflow) |
| `rates-default-1280.png` | Rates |
| `rates-edited-1280.png` | After editing Kenya wall card to 1.8 (toast) |
| `settlement-default-1280.png` | Phoenix settlement |
| `settlement-share-60-1280.png` | Share changed to 0.6 |
| `rewards-ledger-default-1280.png` | Rewards ledger |
| `rewards-ledger-topup-1280.png` | After topping up $500 (toast) |
| `rewards-ledger-low-balance-1280.png` | Balance $240: "top up soon" (reached via a negative top-up) |
| `api-default-1280.png` | Phoenix API docs (full page) |
| `phoenix-preview-featured-1280.png` | Phone preview: featured campaign outlined |
| `phoenix-preview-card-withfeatured-1280.png` | Phone preview: wall card, another brand featured |
| `phoenix-preview-card-nofeatured-1280.png` | Phone preview: wall card, no featured tile |
| `ds-component-sampler-1280.png` | Design-system sampler built from the prototype's CSS classes |
