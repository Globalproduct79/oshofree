# OshoFree

OshoFree is where brands run sponsored offers on the Phoenix Offers wall: a brand creates a campaign,
Global approves it, and Phoenix shows it as a card. Every Phoenix user who shares an offer gets a link of
their own, and each open, claim and onward share of that link is counted in the brand's report.

## Prerequisites

- Node 20
- Docker (runs Postgres 16 on port 5433 with two databases: `oshofree` and `oshofree_test`)

## Setup

```sh
cp .env.example .env
npm install
npm run docker:up
npx prisma migrate deploy
npm run db:seed
npm run dev   # http://localhost:3100
```

The seed needs an empty database. It refuses to run when users already exist; `SEED_FORCE=1` skips that
check, so use it only on a database you have emptied yourself. To start again from nothing:

- `npm run db:reset` wipes the development database, applies every migration and seeds it. Run it yourself
  in a terminal; Prisma refuses a reset started by an AI agent.

## Logins

Every seeded login uses the password `password`. The seed prints it with the logins when it finishes.

| Login | Who | What it shows |
| --- | --- | --- |
| `admin@oshofree.demo` | Global | Review (two campaigns and SunFresh waiting), Advertisers, Rates, settlement, the rewards ledger with held payouts, Phoenix API |
| `tunde@kolabright.demo` | Owner, Kola Bright | A brand in Nigeria: Buy 2 get 1 live, August multipack ended, December draw teaser in review; last month's invoice paid |
| `ada@kolabright.demo` | Manager, Kola Bright | The same workspace as a Manager |
| `dolapo@mediaspec.demo` | Owner, MediaSpec (agency) | An agency with five client brands in Kenya, Senegal, Tanzania and Nigeria (two live, one in review, one paused, one ended); last month's invoice due |
| `chidi@mediaspec.demo` | Manager, MediaSpec (agency) | The agency as a Manager |
| `kemi@mediaspec.demo` | Viewer, MediaSpec (agency) | The agency read-only |
| `wanjiru@pesalink.demo` | Owner, Pesa Link | A brand in Kenya with one live campaign and an overdue invoice, close to its $500 limit |
| `kofi@sunfresh.demo` | Owner, SunFresh Juices | A brand in Ghana still waiting for Global's approval |

## Demo data

The seed builds the prototype's world: four workspaces and their people, Phoenix's rate card (five
markets, FX, the 55 % share), the nine campaigns and their history, invoices and the bell. Every date is
relative to the day you seed, so the demo always looks current. It is a pure function of the run time: one
seeded random generator drives every choice.

Every number comes from the real pipeline. The seed replays each campaign's past days through event
ingestion, `POST /share`, the landing page's opens and claims (which make the payouts, through the fraud
checks) and the daily job (which charges delivery, starts and ends flights, closes last month, reminds about
invoices, warns on pace and sends Monday's digest). Nothing writes a report number directly.

`SEED_SCALE` (default `1`) sets the share of the prototype's volumes the seed generates: impressions, and
with them opens, shares, friends' claims, rewards and spend. At `1` the campaigns show the prototype's
delivery and reward figures, and the seed takes about two minutes. The unit tests and `npm run test:e2e`
seed with `0.2` to stay quick, so their campaigns deliver a fifth as much (and the daily job reports them as
slower than planned).

The seed leaves four invoices:

| Invoice | Workspace | Status | Where it comes from |
| --- | --- | --- | --- |
| INV-0037 | MediaSpec | Paid | Two months back, older than any seeded campaign: the seed issues it at the prototype's amount |
| INV-0041 | Kola Bright | Paid | Last month's close, at whatever Kola Bright's charges came to; Global marks it paid three days later |
| INV-0044 | MediaSpec | Due | Last month's close, at whatever MediaSpec's charges came to |
| INV-0046 | Pesa Link | Overdue | Older than any seeded campaign: the seed issues it at the prototype's amount |

A row marked "(to date)" on an Invoices page is not an invoice. It is this month's charges so far, which the
next month close turns into an invoice. It is never stored, so it never blocks that close.

## Demo controls

Set `DEMO_CONTROLS=1` in `.env` and Global gets two buttons. Nobody else sees them, and each action checks
both the setting and the user again. Leave `DEMO_CONTROLS` unset in production.

- **Simulate a day** (Review, and Campaigns home and Sharing while Global is inside a workspace). It plays
  one market day of Phoenix traffic for every delivering campaign: impressions, opens, claims, shares, the
  friends' opens and claims, and the payouts they earn, all through the same ingestion, `POST /share` and
  landing-page code real traffic uses. Then it runs the daily job for that day. The day simulated is the
  previous market day, so it is charged like any other: the campaign's delivery line for that day is raised
  to the day's new total, never charged twice. It works once per UTC day ("Already simulated today.") and
  needs Phoenix live. The calendar does not move.
- **Run daily job** (Review). It is the cron's run: it charges the market day that has just finished, does every
  other duty as of now, and says how many errors it hit. Every click runs it, past the once-a-day check, and
  that is always safe (see below). A click between midnight and 02:00 UTC counts as that night's run, so the
  cron then finds the day done.

## The daily job

```sh
npm run job:daily                # charges yesterday, then does everything else as of now
npm run job:daily -- 2026-11-10  # replays that day after a run that listed errors
```

Run it once a day at 02:00 UTC from the app's folder, with the app's environment:

```cron
0 2 * * * npm run job:daily
```

Cron reads the line in the server's time zone, so run the server in UTC, or put `CRON_TZ=UTC` above the
line where your cron supports it.

In order, it:

1. Charges delivery: each campaign's impressions in yesterday's market day at its CPM, never past what is
   left of its budget.
2. Ends live and paused campaigns whose budget is spent or whose end date has come.
3. Starts scheduled campaigns whose start has come.
4. Pauses the live campaigns of workspaces over their credit limit.
5. Sends queued reward payouts.
6. Closes last month on the 1st and 2nd (UTC). The 2nd retries a 1st that failed.
7. Reminds about unpaid invoices: once when due in five days or less, once when overdue.
8. Warns about live campaigns off pace, once per market day.
9. Sends Monday's weekly digest.

One failing campaign or duty is listed in the output and the rest of the run goes on; the script exits 1
when anything is listed. A second cron run for the same day does nothing; a replay (a date argument, "Run
daily job" or "Simulate a day") runs anyway. A replay is always safe: every duty is idempotent, and a day's
delivery line is raised to the day's total rather than charged again. A replayed day must be over in every
market.

**Closing a month.** The close issues each workspace an invoice for its charges up to the end of its own
market's month, then Phoenix's settlement statement. Global can also close by hand from Platform ›
Advertisers › "Close month". Closing a month already closed issues nothing. A close is refused while the
month is still running in any market, or when a market has no FX rate for it.

## Phoenix API

Phoenix calls five endpoints, each with `Authorization: Bearer <channel key>`:

- `GET /api/v1/offers?country=KE` — the approved, in-flight offers for a market
- `POST /api/v1/events` — impressions, opens, claims and shares, in batches of up to 500
- `POST /api/v1/share` — mints a sharer's link for an offer
- `POST /api/v1/claims` — a claim code for a session
- `GET /api/v1/links/<code>/stats` — what one share link has earned

The full contract is in `src/lib/api-docs.ts`, which is what Platform › Phoenix API shows. Webhooks and rate
limits are planned, not built.

The development key is `phx_dev_oshofree` (`DEMO_CHANNEL_KEY`). The seed stores its hash on the Phoenix
channel, prints it with the logins, and Platform › Phoenix API shows it outside production. "Rotate key" on
that page issues a new key, shows it once, and keeps the old one working for 24 hours (a second rotation
inside that window retires it at once). So after a rotation `DEMO_CHANNEL_KEY` stops working within a day,
and the demo wall with it, until you put the new key in `DEMO_CHANNEL_KEY` or reseed.

## Demo wall

`/wall` stands in for the Phoenix Offers wall while `DEMO_WALL=1`. It needs no sign-in, and every tap
goes through the same channel API Phoenix will call, with `DEMO_CHANNEL_KEY`. Add `?country=KE` (or
GH, TZ, SN) to see another market; the default is NG.

## Tests

```sh
npm run type-check
npm run lint
npm test            # Vitest against oshofree_test; every table is emptied before each test
```

`npm test` reads `.env.test`, so it never touches the development database; it applies migrations to
`oshofree_test` first.

End to end, once per machine run `npx playwright install chromium`, then:

```sh
npm run test:e2e
```

It migrates, empties and seeds `oshofree_test` (at `SEED_SCALE=0.2`), starts its own Next server on port
3101 (build output in `.next-e2e`), and runs 13 Playwright flows: sign-up, approval, sharing from the wall
and a friend's claim, pause and end, credit limits, people, the command palette and Global's switcher. The
flows change the data as they go, so always run the whole script: a bare `npx playwright test` without the
reseed is not supported. It never touches the dev server on 3100 or the development database.

## Production build

```sh
npm run build
npm start   # port 3100
```

`next.config.ts` builds into `NEXT_DIST_DIR` when it is set (default `.next`). On a machine where
`npm run dev` is running, build into another folder so the two never share output:

```sh
NEXT_DIST_DIR=.next-build npm run build
```

## Deploy checklist

On each release, in this order:

```sh
npx prisma migrate deploy
npm run bootstrap
```

then make sure the daily job is in cron:

```cron
0 2 * * * npm run job:daily
```

- `npx prisma migrate deploy` applies new migrations. Slice 2 adds six: `20261113230000_slice2`,
  `20261114020000_revision_cpm`, `20261114100000_claim_code_per_campaign`, `20261114120000_reward_lookups`,
  `20261114140000_system_audit_actor` and `20261114160000_invoice_country`. Never run the seed in production.
- `npm run bootstrap` creates what production needs before anyone signs in, and only what is missing:
  the Global user, the Phoenix channel (live in all five markets), Phoenix's rate card, FX and 55 % share
  (the seed's reference figures, from `src/lib/reference-rates.ts`), the three fraud rules and the aggregator
  account. The only things it changes are the Global user's: it makes that user Global again, and resets the
  password when the stored one no longer matches `BOOTSTRAP_ADMIN_PASSWORD`. Everything else that is there
  stays, so Global's own rates, FX, share, fraud toggles and rotated key survive every release. It prints one
  line saying what it created, what it updated and what was already there.
  - `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`: the Global user. Needed on the first run; it stops
    without writing anything if there is no Global user to create. Later runs make that user Global again
    if needed and set the password only when it has changed. The password is never printed. Unset
    `BOOTSTRAP_ADMIN_PASSWORD` after the first run; later runs keep the Global user they find without it.
  - `PHOENIX_CHANNEL_KEY`: Phoenix's API key. If it is unset when the channel is first created, the bootstrap
    makes a key and prints it once. Store it then; only its hash is kept. Once the channel exists, the bootstrap
    leaves its key alone; rotate it from Platform › Phoenix API. If that first run fails after creating the
    channel, the key was printed above the error; if it was lost, rotate it on Platform › Phoenix API.
- `npm run bootstrap`, `npm run job:daily` and `npx prisma migrate deploy` run with the devDependencies
  (`tsx`, `dotenv-cli`, `prisma`), so install them on the host: `npm ci`, not `npm ci --omit=dev`.
- The daily job runs at 02:00 UTC, from the app's folder with the app's environment (see "The daily job").
- `DATABASE_URL`: the production Postgres.
- `APP_URL`: the public `https://` origin. Share links are built from it, and the visitor cookie is
  marked Secure only when it starts with `https://`.
- `AUTH_SECRET`: a random string of 32 or more characters.
- `AUTH_TRUST_HOST=true`.
- `IP_HASH_SALT`: 16 or more random characters. Production refuses to hash a visitor's IP without it,
  so landing pages fail until it is set.
- `UPLOAD_DIR`: where uploads go (default `./uploads`). Object storage is not built yet, so give the app a
  persistent volume and run a single instance.
- `DEMO_CONTROLS`, `DEMO_WALL`, `DEMO_CHANNEL_KEY`, `SEED_SCALE`, `SEED_FORCE`: unset. The demo controls
  and the wall are off unless their variable is exactly `1`.
