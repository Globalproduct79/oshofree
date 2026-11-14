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
```

Then create the schema and the demo data, one of:

- `npm run db:reset` — wipes the development database, applies every migration and seeds it. Run it
  yourself in a terminal; Prisma refuses a reset started by an AI agent.
- `npx prisma migrate deploy && npm run db:seed` — for agents and CI, on an empty database. The seed
  refuses to run if users already exist.

```sh
npm run dev   # http://localhost:3100
```

## Demo data

The seed builds the prototype's world: four workspaces and their people, Phoenix's rate card (five
markets, FX, the 55 % share), the nine campaigns and their history, invoices and the bell. Every date is
relative to the day you seed, so the demo always looks current. Every number comes from the real pipeline:
the seed replays each campaign's past days through event ingestion, `POST /share`, the landing page's
opens and claims (which make the payouts, through the fraud checks) and the daily job (which charges
delivery, starts and ends flights, closes last month, reminds about invoices, warns on pace and sends
Monday's digest). Kola Bright's and MediaSpec's invoices for last month (INV-0041 and INV-0044) are that
close's, at whatever their campaigns' charges came to. The only invoices the seed writes itself are two
older than any seeded campaign: MediaSpec's paid INV-0037 and Pesa Link's overdue INV-0046, at the
prototype's amounts. It is a pure function of the run time: one seeded random generator drives every choice.

Every seeded login uses the password `password`.

| Login | Who | What it shows |
| --- | --- | --- |
| `admin@oshofree.demo` | Global | Review (two campaigns and SunFresh waiting), Advertisers, Rates, settlement, the rewards ledger with held payouts, Phoenix API |
| `tunde@kolabright.demo` | Owner, Kola Bright | A brand in Nigeria: Buy 2 get 1 live, August multipack ended, December draw teaser in review; last month's invoice paid |
| `ada@kolabright.demo` | Manager, Kola Bright | The same workspace as a Manager |
| `dolapo@mediaspec.demo` | Owner, MediaSpec (agency) | An agency with five client brands in Kenya, Senegal, Tanzania and Nigeria (two live, one in review, one paused, one ended); last month's invoice due |
| `chidi@mediaspec.demo` | Manager, MediaSpec (agency) | The agency as a Manager |
| `kemi@mediaspec.demo` | Viewer, MediaSpec (agency) | The agency read-only |
| `wanjiru@pesalink.demo` | Owner, Pesa Link | A brand in Kenya with one live campaign and an overdue invoice, close to its $500 limit |
| `kofi@sunfresh.demo` | Owner, SunFresh Juices | A brand in Ghana still awaiting Global's approval |

`SEED_SCALE` (default `1`) sets the share of the prototype's volumes the seed generates: impressions, and
with them opens, shares, friends' claims, rewards and spend. At `1` the campaigns show the prototype's
delivery and reward figures, and the seed takes about two minutes. The unit tests and `npm run test:e2e`
seed with `0.2` to stay quick, so their campaigns deliver a fifth as much (and the daily job reports them
as slower than planned).

The Phoenix channel's development key is `phx_dev_oshofree` (`DEMO_CHANNEL_KEY`). The seed stores its
hash on the Phoenix channel, prints it with the logins, and `/admin/api` shows the key outside production.

## Tests

```sh
npm run type-check
npm run lint
npm test            # Vitest against oshofree_test; every table is emptied before each test
```

End to end, once per machine run `npx playwright install chromium`, then:

```sh
npm run test:e2e
```

It migrates, empties and seeds `oshofree_test`, starts its own Next server on port 3101 (build output
in `.next-e2e`), and walks the whole loop: sign up, approval, share from the wall, a friend's claim and
the brand's report. It never touches the dev server on 3100 or the development database. The test
scripts load `.env.test` with override, so an exported `DATABASE_URL` cannot point them elsewhere.

## Demo wall

`/wall` stands in for the Phoenix Offers wall while `DEMO_WALL=1`. It needs no sign-in, and every tap
goes through the same channel API Phoenix will call, with `DEMO_CHANNEL_KEY`. Add `?country=KE` (or
GH, TZ, SN) to see another market; the default is NG.

## Deploy checklist

- `DATABASE_URL`: the production Postgres. Run `npx prisma migrate deploy` on each release. Never run
  the seed there.
- `APP_URL`: the public `https://` origin. Share links are built from it, and the visitor cookie is
  marked Secure only when it starts with `https://`.
- `AUTH_SECRET`: a random string of 32 or more characters.
- `AUTH_TRUST_HOST=true`.
- `IP_HASH_SALT`: 16 or more random characters. Production refuses to hash a visitor's IP without it,
  so landing pages fail until it is set.
- `DEMO_WALL`: unset. The wall and its server actions are off unless it is exactly `1`.
- `DEMO_CHANNEL_KEY`: unset. Issue a real key per channel and store only its sha256 hex digest in that
  Channel row's `apiKeyHash`, with `isLive` true:
  `node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" <key>`
- Uploads still go to local disk (`UPLOAD_DIR`, default `./uploads`). Object storage is not built yet,
  so give the app a persistent volume and run a single instance.
