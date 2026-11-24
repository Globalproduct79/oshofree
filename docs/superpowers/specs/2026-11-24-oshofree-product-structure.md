# OshoFree — simplified product structure

24 November 2026. Reviewed against the code on `staging` (07db312 plus the audit report). This document defines the
product as three experiences, states what each thing in it means, and lists what should change. It removes no
functionality and redesigns nothing. It is the agreed picture to build the next changes against.

## 1. The three experiences

| Experience | Who | Where in the app | Why it exists |
| --- | --- | --- | --- |
| **Advertiser workspace** | Brands and agencies: Owners, Managers, Viewers | `/app/…` | A company runs sponsored offers on Phoenix, sees what they deliver, and pays for them |
| **OshoFree Global administration** ("Platform") | OshoFree staff with the Global flag | `/admin/…` | Approves advertisers and offers, sets prices, settles with Phoenix, pays sharers, keeps the integration healthy |
| **Consumer experience** | Phoenix users and their friends | Phoenix's own wall and app (fed by `/api/v1/…`), then OshoFree's landing page `/o/<code>`; sample wall at `/wall` | A person sees an offer, claims it, shares it and earns airtime for friends who claim |

The consumer experience is mostly Phoenix's: the wall, the share button and the OTP-verified number are Phoenix's
screens, built on OshoFree's API. OshoFree owns one consumer screen, the landing page, and keeps a sample wall for
demonstrations (`DEMO_WALL=1`). Nothing in this document changes that split.

Every signed-in person is in exactly one experience at a time. The topbar's **Workspaces** switcher moves between
workspaces, and for Global between a workspace and Platform. Global inside a workspace sees exactly what that
workspace's Owner sees, under a banner that says so; the Platform pages never appear inside a workspace.

## 2. Definitions

### A workspace

A workspace is **one advertiser account**: the company that signs the terms, holds the credit and receives the
invoices. It has a name, a type (**Brand** or **Agency**), a billing country (one of the five markets), an optional
registration number, an approval status (pending, approved, declined), a credit limit, payment terms and the reward
caps that apply to all of its campaigns. Everything an advertiser does hangs off one workspace: campaigns, sharing,
rewards, billing, invoices, credit requests, people, notifications.

One workspace, one credit limit, one invoice per month. That rule does not change for agencies.

### A brand

A brand is **the name consumers see on an offer**: the card on the wall and the landing page say "Kola Bright", not
"Kola Bright Ltd workspace". For a Brand workspace the brand is normally the company itself. For an Agency workspace
each brand is one of its clients.

Today a brand is **a text field on each campaign** (`Campaign.brand`), not a record of its own. The Workspace page
lists an agency's distinct brand names with their campaign counts, and "Add client brand" opens the campaign form at
the Brand field. That is the whole of brand management. See §5, change 1.

### How an agency manages several brands

One agency workspace, many client brands, each campaign naming its brand. The agency's people see every brand's
campaign in one list; the agency is billed as one customer, with one credit limit covering all its clients'
campaigns; its Owners invite its own staff, not the clients'. A client does not sign in to OshoFree. If a client wants
its own account, it registers its own Brand workspace.

### Who can access a workspace

- **Members**: people with a membership row, each with one role (Owner, Manager, Viewer). The person who registers the
  workspace is its first Owner. Everyone else joins through an invitation an Owner sends, at the role on the invite.
  A person can be a member of several workspaces and switches between them.
- **Global**: OshoFree staff may enter any workspace from Platform. Each entry is written to the audit trail. Global
  is decided from the database on every request, never from the session token.
- Nobody else. Phoenix reaches OshoFree only through the channel API with its key and never sees a workspace.

### What each role may do

From `src/lib/capabilities.ts`, which both the sidebar and every server action consult.

| What | Viewer | Manager | Owner | Global |
| --- | --- | --- | --- | --- |
| See campaigns, sharing, rewards, billing, invoices, people, workspace, notifications | yes | yes | yes | yes |
| Create, edit, submit, pause, resume, end a campaign; change the offer without review | – | yes | yes | yes |
| Set the workspace's reward caps | – | yes | yes | yes |
| Request a higher credit limit | – | – | yes | yes |
| Invite, resend, revoke, remove people | – | – | yes | yes |
| Edit workspace details (name, registration; type and country only while pending) | – | – | yes | yes |

Two observations for the product owner, not changes: a Viewer sees the full billing statement and every invoice
amount, which may be more than a read-only role should see; and a Manager can change reward caps, which moves money,
but cannot request credit. Both are as the prototype specified them.

### Advertiser information versus platform information

| The advertiser owns and sees | The platform alone sets or sees | Both, from different sides |
| --- | --- | --- |
| Campaigns and their creatives, delivery per day, the funnel | Approval decisions and decline/reject reasons as written | Campaign status and the reason given (advertiser reads it) |
| Sharers (number masked) and what their friends did; points | Credit limit (sets), terms, account manager | Credit limit (advertiser reads, may request more) |
| Rewards owed per campaign; the workspace's own caps | Rate card (CPM per market), FX, Phoenix's share | Invoices (Global marks paid; advertiser reads and prints) |
| Billing statement for the month; invoices; credit requests it raised | Settlement statements, aggregator balance and top-ups | Credit requests (advertiser raises, Global decides) |
| People and invitations; workspace details | Fraud rules; held payouts and their release | Held rewards (advertiser sees "held", Global sees why) |
| Its own notifications | Phoenix API key and its rotation; audit trail; every workspace at once | — |

The rule: an advertiser sees every number that is about its own campaigns and money, and nothing that is about
another advertiser, about Phoenix's economics, or about why Global decided something beyond the reason it was given.

## 3. Navigation

### Advertiser workspace (keep as it is)

```
Sidebar                                 Topbar
  Campaigns                               Search ⌘K · Bell · Workspaces · Account
    Campaigns            (home, count of running)
    New campaign         (Owner, Manager)
  Growth
    Sharing
    Rewards
  Money
    Billing & credit
    Invoices             (count of due)
  Organisation
    Workspace
    People
    Notifications
```

Four groups, ten items, no sub-menus. A campaign's page sits under Campaigns; the edit form is the New campaign
form prefilled. This is already simple and should stay. The changes in §5 are inside pages, not to this list.

### Global administration (regroup, same pages)

Today Platform is one flat group of six. Regrouping it by what Global is doing makes the console read like the
advertiser's does, without adding or removing a page:

```
Sidebar                                 Topbar
  Approvals                               Search ⌘K · Bell · Workspaces · Account
    Review               (count of campaigns, revisions and workspaces waiting)
  Advertisers
    Advertisers          (list → one advertiser's page → Open workspace)
  Money
    Rates
    Phoenix settlement
    Rewards ledger
  Integration
    Phoenix API
```

Global's entry into a workspace stays as it is: the workspace's own sidebar under the banner "you are acting as
Global inside <workspace>", and **Back to Platform**.

### Consumer (no navigation; one flow)

```
Phoenix wall (Phoenix's screen)  →  Offer landing page /o/<code>  →  Claim  →  Share
                                     details · age gate · brand       code or link   WhatsApp, SMS, copy…
```

A friend who opens a shared link goes through the same page on the sharer's link; the friend's claim is what pays
the sharer. `/o/preview` is the advertiser's preview of the same page and records nothing. `/wall` is the sample
wall, a stand-in for Phoenix's, shown only on demo machines.

## 4. Every major screen

Format: who uses it · why it exists · what they can do · what happens next.

### Getting in

**Sign up / Sign in** (`/sign-up`, `/sign-in`) · anyone · an account is a person, not a workspace · create an account
with email and password, or sign in · a person with no workspace goes to Create workspace; a member lands in their
first workspace; Global lands on Review.

**Create workspace** (`/app/new-workspace`) · a new sign-up with no workspace · registration · name, type (Brand or
Agency), billing country, registration number · the workspace is created pending, the person is its Owner, and they
land in it under the "Awaiting approval" banner. They can build campaigns now; nothing goes live until Global
approves.

**Invitation** (`/invite/<token>`) · someone an Owner invited · the one way into an existing workspace · see who
invited them, to which workspace, as what; create an account or sign in; accept · they land in that workspace at the
invite's role, with a toast saying so.

### Advertiser workspace

**Campaigns** (`/app`) · every member · the home: everything this workspace is running on Phoenix, the one that
matters most on top · filter by status, open a campaign, start a new one (Owner, Manager), continue a draft kept in
this browser · opens a campaign page or the form.

**New campaign / Edit offer** (`/app/campaigns/new`, `/app/campaigns/<id>/edit`) · Owner, Manager · the offer is
defined here and nowhere else: brand, market, placement, creative, headline and details, how it is redeemed, budget,
dates, the sharer's reward · fill it, see the cost estimate and the credit it will use, preview the wall card and the
landing page, save a draft, submit for review · the campaign goes to Global's Review queue. A running campaign's
edit carries only the offer (not money, dates or market) and waits as a revision; the live offer keeps serving
until Global approves the revision.

**Campaign page** (`/app/campaigns/<id>`) · every member · one campaign's truth: status, KPIs, impressions per day,
funnel, sharing, recent activity, the offer, history · pause, resume, end, edit the offer, change what needs no
review (Owner, Manager); a Viewer reads it all · pause stops delivery and charges; end is final; edits go to review.

**Sharing** (`/app/sharing`) · every member · how the campaigns spread: totals, the by-campaign table, the sharers
and what their friends did, where people share, points issued · read; open a sharer; start a campaign when there is
none · informs the next offer; nothing to decide here.

**Rewards** (`/app/rewards`) · every member; Owner and Manager can save · what a sharer earns per successful share
per campaign, and the workspace caps (per sharer per day, share of budget) · read the per-campaign reward (it is set
on the campaign form); change the caps · caps apply to every claim from then on.

**Billing & credit** (`/app/billing`) · every member; Owner requests credit · what this month has cost and what
credit is left · read the KPIs and the month's statement, see how to pay, request a higher limit (Owner) · the
request goes to Global; a campaign paused for credit resumes when the limit rises or an invoice is paid.

**Invoices** (`/app/invoices`, `/app/invoices/<id>/print`) · every member · the monthly invoices and their state
(due, overdue, paid) · open, print · "Mark paid" is Global's; paying clears credit in use.

**Workspace** (`/app/workspace`) · every member; Owner edits · who the company is on the platform: tile, name, kind,
approval, credit limit, markets, registration; for an agency, its client brands · edit details (type and country
only while pending); add a client brand (opens the campaign form) · changes show in the sidebar and on Global's
Advertisers page.

**People** (`/app/people`, `/app/people/invite`) · every member sees; Owner acts · who works here and at what role,
the open invites, what each role can do · invite (with a role), resend, revoke, remove · the invitee gets a link
that only they can use; the role takes effect on acceptance.

**Notifications** (`/app/notifications`) · every member · the full list behind the bell: approvals, rejections,
pace warnings, invoices, credit · read, open the thing it is about · nothing else; the bell shows the latest twenty.

### Global administration

**Review** (`/admin/review`) · Global · the queue: new advertisers waiting, campaigns and revised offers waiting,
plus the platform's numbers and everything live · approve or decline a workspace; approve or reject a campaign or
revision with a reason; preview the offer as Phoenix will serve it; on demo machines, simulate a day or run the
daily job · the advertiser is notified; a live offer appears on Phoenix's next fetch.

**Advertisers** (`/admin/advertisers`, `/admin/advertisers/<id>`) · Global · every workspace with its credit, and
one advertiser's full picture: the facts Global controls, campaigns, invoices, credit requests, audit trail · set the
credit limit in place; approve, decline or re-approve; set terms and account manager; mark an invoice paid; decide a
credit request; close the month; **Open workspace** to see what they see · each action is audited and, where it
matters to the advertiser, notified.

**Rates** (`/admin/rates`) · Global · the price of delivery: CPM per market and placement, FX per market · edit a
rate or FX · new campaigns price at the new rate; running ones keep their snapshot.

**Phoenix settlement** (`/admin/settlement`) · Global · what Phoenix is owed per market month, the share that
applies from the next statement, closed statements · set the share; mark a statement paid · the share takes effect
from the next statement.

**Rewards ledger** (`/admin/rewards`, `/admin/rewards/top-up`) · Global · what sharers are owed per campaign, the
aggregator balance that pays it, the fraud switches, the held rewards · top up; switch a fraud rule; release or
reject a held reward (each links into the workspace's activity line) · a released reward is sent; a rejected one is
not paid and is written to the campaign's history.

**Phoenix API** (`/admin/api`) · Global and Phoenix's engineers · the contract: endpoints, payloads, the key ·
read; rotate the key · the old key stops working at once; Phoenix must be given the new one.

### Consumer

**Offer landing page** (`/o/<code>`) · a Phoenix user, or a friend who received a link · the offer itself, with the
brand's details, the age gate where set, and the claim · open, read the details, claim (a code to show, or a link
to the brand), share on · the open, claim and share are counted on this link; a friend's claim on a sharer's link
earns the sharer airtime, within the caps, through the fraud checks.

**Sample wall** (`/wall`, demo machines only) · anyone demonstrating OshoFree · shows what Phoenix shows, from the
same `/api/v1/offers` feed · browse the live offers, open one, share from it · exactly the landing-page flow above.

**Phoenix's screens** (not OshoFree's) · a Phoenix user · the wall, the share button and the number verification are
Phoenix's; OshoFree supplies offers, issues share links and claim codes, and receives impression, open, claim and
share events.

## 5. What should change

Ordered by how much they clarify the product. None removes a feature. None is to be started before this document
is agreed. Items 1 and 5 touch data; the rest are page-level.

1. **Make a brand a record, not a text field.** Today an agency's clients exist only as spellings of `Campaign.brand`,
   so "Kola Bright" and "Kola bright" are two clients, nothing carries a client's logo or default market, and there is
   no per-client view. Add a `Brand` row owned by the workspace (name, optional tile colour and logo, default country);
   the campaign form picks one (a Brand workspace has one, made at registration, so nothing changes for it); the
   Workspace page's client list becomes the place to add and rename brands; Campaigns home gets a brand filter for
   agencies; Billing's statement groups lines by brand. Invoices and credit stay per workspace. Existing campaigns
   migrate by their current brand text.

2. **Group Platform's sidebar** as in §3: Approvals, Advertisers, Money, Integration. Copy only; the pages do not move.

3. **Make Review queue-first.** The page opens with the platform's numbers and Live now before the queues. Put the
   three queues (advertisers, campaigns, revisions) first, numbers and Live now after. Same content, in the order
   Global needs it.

4. **Surface credit requests where Global looks.** A credit request is visible only on that advertiser's page, and
   the audit found Global is not notified of it or of a new registration. Add open credit requests to Review's count
   and queue, and notify Global on registration and credit request. (Audit finding I10.)

5. **One "this month so far" row.** Billing shows the running month's statement; Invoices also shows a running-month
   row "(to date)". Keep the statement on Billing and replace the Invoices row with one line linking to it, so there
   is one place the current month's total lives. Invoices stays the list of issued invoices.

6. **Decide what a Viewer sees of money.** Keep the role as it is, but write down whether a Viewer should see invoice
   amounts and the statement. If not, Billing and Invoices become Owner/Manager pages and the Viewer's sidebar loses
   the Money group. Product call; no code until decided.

7. **Keep the approval actions in two places, on purpose.** Review approves and declines a waiting workspace; the
   advertiser's page can also decline, and alone can re-approve. That is not a duplication to remove: Review is the
   queue, the advertiser's page is the record. Say so in the page copy so nobody goes looking for re-approve on
   Review.

8. **Rewards and Sharing stay separate.** Both show a by-campaign table and that reads as duplication, but Sharing is
   about reach and Rewards about what is paid and the caps that bound it. Leave them; revisit only if brand records
   (item 1) make Growth need a brand filter on both.

9. **Notifications page stays.** The bell shows the latest twenty, the page the whole history. Not a duplication.

10. **Phoenix API docs stay under Platform**, but their audience is Phoenix's engineers; when a shared integration
    environment exists, publish the same page there unauthenticated with the key box removed.

Not in scope here and unchanged: the audit's defects (fixed on their own branches, by priority), the design system,
the landing page's look, the demo controls.

## 6. Open calls for the product owner

1. Brand as a record (item 1): agree the shape before any migration.
2. Viewer and money (item 6): yes or no.
3. Should a Manager set reward caps, or only an Owner? Today a Manager can.
4. Should the consumer sample wall stay in the product (behind `DEMO_WALL`) or move to a separate demo site once
   Phoenix's wall is live?
