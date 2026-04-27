# AGENTS.md

## Cursor Cloud specific instructions

### Overview
FrontBill is a Next.js 16 (App Router) hotel management SaaS using Supabase as the hosted backend (database, auth, realtime). Currency is Nigerian Naira. There is no local database; all data lives in Supabase.

### Running the dev server
```
pnpm dev
```
Starts on `http://localhost:3000`. The root path (`/`) redirects to `/auth/login`.

### Lint
Next.js 16 removed the built-in `next lint` subcommand, so `pnpm lint` does not work. There is no ESLint configuration in the project. Skip lint checks.

### Build
`pnpm build` will fail at the static-page-generation stage if Supabase credentials are missing or if client components that use React context are pre-rendered. The compilation step itself succeeds. `next.config.mjs` sets `ignoreBuildErrors: true` for TypeScript.

### Tests
No test framework or test files exist in this codebase.

### Authentication & demo accounts
Supabase secrets (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) must be provided as environment variables (injected via Cursor Secrets).

To seed demo users with auto-confirmed emails, call:
```
curl -X POST http://localhost:3000/api/setup/seed-users
```
This creates:
- `admin@frontbill.com` / `Admin@123456` (Admin)
- `frontdesk@frontbill.com` / `Desk@123456` (Front Desk)

### Key caveats
- The `pnpm-lock.yaml` is listed in `.gitignore` but is present in the repo; `pnpm install` works from the lockfile.
- The `middleware.ts` convention is deprecated in Next.js 16 (warning about migrating to `proxy`); this is cosmetic and does not block development.
- `pnpm install` warns about ignored build scripts for `core-js` and `sharp`; these are non-critical.
- The `OPENAI_API_KEY` env var is optional; only needed for the three `/api/ai/*` routes.
- SQL migration scripts in `/scripts/` (001–011) are for the Supabase SQL Editor; they are not run locally.
