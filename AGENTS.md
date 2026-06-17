# AGENTS.md

## Cursor Cloud specific instructions

### Overview
FrontBill is a Next.js 16 (App Router) hotel management SaaS using Supabase as the hosted backend (database, auth, realtime). Currency is Nigerian Naira. **Dev and production both use cloud Supabase** — copy API keys from the Supabase Dashboard into `.env.local` (see `.env.local.example`). Do not point `.env.local` at `127.0.0.1:54321` unless you intentionally run local Docker (`supabase start`).

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

### Authentication
Supabase secrets (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) must be provided as environment variables (injected via Cursor Secrets or `.env.local`).

If login fails with `fetch failed` to `127.0.0.1:54321`, `.env.local` still targets local Docker or the browser has stale auth cookies — use cloud URL in `.env.local`, restart `pnpm dev`, open `/auth/login` (clears local session), or visit `/api/auth/logout`.

On **staging/dev**, hotel owners register at `/auth/sign-up` (requires `NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP=true` or `SUPABASE_ENV=staging`). Staff are added by an admin under **Users & Roles** — there are no built-in demo logins.

### Key caveats
- The `pnpm-lock.yaml` is listed in `.gitignore` but is present in the repo; `pnpm install` works from the lockfile.
- The `middleware.ts` convention is deprecated in Next.js 16 (warning about migrating to `proxy`); this is cosmetic and does not block development.
- `pnpm install` warns about ignored build scripts for `core-js` and `sharp`; these are non-critical.
- The `OPENAI_API_KEY` env var is optional; only needed for the three `/api/ai/*` routes.
- **Email alerts (off-app):** Night Audit approvals (backdate, room change, move dates, extend discounts) email Superadmin/Admin/Manager when `RESEND_API_KEY` is set. Optional: `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL`, `NIGHT_AUDIT_NOTIFY_EXTRA_EMAILS` (or `BACKDATE_NOTIFY_EXTRA_EMAILS`). Browser push notifications are not implemented yet.
- SQL migration scripts in `/scripts/` (001–011) are for the Supabase SQL Editor; they are not run locally.
- The `/api/cron/auto-checkout` job does nothing unless `ENABLE_AUTO_CHECKOUT=true` is set (staff checkout is manual by default).
