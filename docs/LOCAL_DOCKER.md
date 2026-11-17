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
