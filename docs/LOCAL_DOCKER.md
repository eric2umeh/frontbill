# Local Docker testing (FrontBill)

Use this so daily testing hits **local Supabase in Docker**, not cloud (avoids Vercel/Supabase egress).

## Prerequisites

- Docker Desktop running (`docker info` works)
- Supabase CLI (`supabase --version`)
- Node + pnpm

## One-time / daily start

```bash
cd /Users/MAC/Desktop/next/frontbill

# 1) Docker Desktop must be running
docker info

# 2) Local Supabase
supabase start
supabase status          # Studio http://127.0.0.1:54323

# 3) Point the app at local Docker (cloud backup is .env.local.cloud)
cp .env.local.docker .env.local   # or keep .env.local already on 127.0.0.1:54321

# 4) App
pnpm install
pnpm dev
```

Open http://localhost:3000 → redirects to `/auth/login`.

## First login on a fresh local DB

Local Auth is **empty of your cloud passwords**. Create a hotel owner:

1. Open http://localhost:3000/auth/sign-up  
   (enabled when `SUPABASE_ENV=local` / `NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP=true`)
2. Register a test hotel + admin
3. Sign in with that email/password

Studio (SQL UI): http://127.0.0.1:54323  
Mailpit (emails): http://127.0.0.1:54324

## Switch back to cloud staging (if needed)

```bash
cp .env.local.cloud .env.local
# stop local stack when done:
supabase stop
```

## Apply SQL to local DB

Cloud SQL in `scripts/*.sql` is not auto-applied. Against local Postgres:

```bash
docker exec -i supabase_db_frontbill psql -U postgres -v ON_ERROR_STOP=0 < scripts/NNN_your_script.sql
```

Or use Studio → SQL Editor at http://127.0.0.1:54323

## Push to prod later

1. Test fully on Docker locally
2. Commit / PR / merge
3. Deploy host (Railway) + run **new** SQL on **prod** Supabase only after deploy
4. Keep `.env.local` on Docker or staging — never point daily local work at prod

## Verify you are not hitting cloud

In the browser on localhost → Network: API calls should go to `127.0.0.1:54321`, not `*.supabase.co`.

## Bulk opening stock / auditor counts (Option H)

Heavy stock setup (Central Store, Kitchen Finished Menu, Kitchen Store, Main Bar qty) burns **cloud Supabase egress** when two people edit all night on staging/prod.

**Do large opening counts on Docker local**, then only use cloud for day-to-day ops:

1. `cp .env.local.docker .env.local` and `supabase start` + `pnpm dev`
2. Sign in on local, enter opening stock / physical counts as needed
3. Keep cloud for live hotel work; avoid multi-hour “count everything” sessions on staging/prod

Cloud egress controls (keep these defaults unless you need live multi-user stock):

| Option | Default |
|--------|---------|
| **C** | Per-item qty patches (not full kitchen/bar JSON) |
| **D** | Supply Realtime/live refetch **off** (`NEXT_PUBLIC_SUPPLY_LIVE_SYNC` unset) |
| **E** | Stock-count writes batched (~2.5s; flush on tab hide) |
| **G** | Fat supply hydrate only on `/supply` and `/outlets` |
| **H** | Bulk opening counts on Docker (this section) |

```bash
# .env.local (cloud) — optional; turns Option D live sync back on
NEXT_PUBLIC_SUPPLY_LIVE_SYNC=true
```

### Realtime egress SQL (staging → prod)

After enabling org-live Realtime (`scripts/084_…`), also run on **staging first**, then **prod after deploy**:

- `scripts/085_realtime_supply_snapshots_default_identity.sql`
- `scripts/086_realtime_org_live_default_identity.sql` (bookings / outlet menus / catalog)

Git push alone does not apply these — run them in the Supabase SQL Editor per project.

### Central Store price history (staging → prod)

After deploying the Price history UI on Central Store item edit:

- `scripts/088_supply_catalog_price_history.sql` (table + trigger on `last_price` / `benchmark_price`)

Git push alone does not apply this — run it in the Supabase SQL Editor per project.

### Logs Ingest (staging → prod)

Dashboard **Log Ingestion** grows with every API/Postgres/Auth/Realtime log line. App polls are slowed in code; also run on each cloud project:

- `scripts/087_reduce_postgres_log_ingest.sql` (`log_statement=none`, slow-query threshold 2s)

Optional CLI (connection open/close spam):

```bash
supabase postgres-config update --experimental --remote=<project-ref> \
  --config log_connections=false --config log_disconnections=false
```
