# FrontBill staging test plan

Use **staging Supabase** only (`SUPABASE_ENV=staging` in `.env.local`). Run SQL from `/scripts/` in the staging SQL Editor before testing features that need them.

## Phase 0 — Setup (once per environment)

- Confirm `scripts/063_supply_chain_persistence.sql` has been run on **staging** (required for PO / retirement sync across users).
- Two test browsers (or normal + incognito): e.g. **store** login and **accountant** login, same organization.
- Optional third session: **purchaser** / **manager** / **admin**.

**After production deploy:** run `063_supply_chain_persistence.sql` on **production** Supabase if not already applied (Git deploy does not run SQL).

---

## Phase 1 — Manual smoke checklist (~45 min per release)

Run top-to-bottom on staging. Mark pass/fail. Fix blockers before merge to `main`.

### Auth & shell

- Login / logout; session survives refresh.
- Header room strip (Avail / Occ / OOO) loads without console errors.
- Bell notifications load (no endless `Failed to fetch`).

### Bookings & front office

- Bookings list: date filter resets status to **All** when a date is picked.
- New walk-in booking: guest name title-cases while typing.
- Check-in / check-out on one folio.
- Room stats **Occ** matches in-house count on Bookings vs Outlets/Kitchen header.

### Reservations

- Create reservation; guest/org title-case while typing.
- List filters and open detail.

### Outlets (POS)

- Open outlet, add item to order, take payment, print receipt if used.
- Outlet menu search title-case on new items (if applicable).

### Central store & supply

- Central store: add/edit item, issue to kitchen.
- Raise PO: add lines → **Send to accountant** → accountant sees **Expenses → Purchase orders** (within ~30s or on tab focus).
- Accountant accept → manager approve → purchaser sees PO ready in **Purchasing**.
- Retire at market: qty/price fields — no spinners, empty fields, type `2` not `02`.
- Submit retirement → **Expenses → Retirement** (not Purchasing queue).
- Accountant reject retirement → purchaser sees **Edit retirement** (not “awaiting accountant”).
- Accountant accept → stock updates; PO in accepted list.

### Kitchen

- Open batch → Production Records → close batch (no error page).
- CSV template download from bulk upload dialog.
- Optional: import one test batch row.

### Accounting

- Expenses: add one line, correct category.
- **Purchase orders** tab: PO queue only (no retirement).
- **Retirement** tab: pending + accepted lists.

### Night audit & admin

- Night Audit: one tab loads with filters/pagination.
- Users & Roles: list loads (admin).

---

## Phase 2 — Unit tests (incremental, free locally)

**Tool:** Vitest (recommended) — `pnpm add -D vitest`

**Priority libs** (pure functions, no browser):

| Area | Files to test first |
|------|---------------------|
| Supply chain qty | `lib/supply-chain/measurement-units.ts` — `sanitizeQuantityInput`, `parseQuantityValue` |
| Room stats | `lib/rooms/compute-room-inventory-stats.ts` |
| PO helpers | `lib/supply-chain/po-format.ts`, `lib/supply-chain/po-active.ts` |
| Permissions | `lib/permissions.ts` — `canSupplyRetirementReview`, PO approval helpers |
| Currency | `lib/utils/currency.ts` |

**Example first test file:** `lib/supply-chain/measurement-units.test.ts`

```bash
pnpm vitest run
```

Add tests when fixing bugs (regression test for leading-zero qty, retirement status filters).

---

## Phase 3 — Playwright E2E (~1–2 days setup)

**Tool:** `@playwright/test` against staging preview URL or `localhost:3000` + staging env.

**Suggested smoke flows (5–15 tests):**

1. Login as store staff (storage state).
2. Login as accountant (separate project).
3. Send PO → accountant sees Purchase orders tab.
4. Full PO approve chain (admin fast-track optional).
5. Purchasing retire form qty input behavior.
6. Submit retirement → accountant Retirement tab.
7. Reject retirement → purchaser can edit.
8. Bookings date filter + Occ strip.
9. Outlet order + payment (if test data exists).

**CI:** GitHub Action on PR → `pnpm build` + `playwright test` with staging secrets in repo settings (never prod keys in PR forks).

```bash
pnpm exec playwright install
pnpm exec playwright test
```

---

## Phase 4 — Release rhythm

| When | What |
|------|------|
| Every feature PR | Phase 1 checklist for touched modules |
| Weekly / pre-merge | Full Phase 1 on staging |
| After Playwright setup | Phase 3 on PR + manual spot-check |
| After merge to `main` | Vercel prod deploy → run **new SQL** on prod → 5 min prod smoke |

---

## Known environmental issues

- **`Failed to fetch` to Supabase:** network/VPN/session — re-login at `/auth/login`, check Supabase project not paused.
- **PO not visible to accountant:** confirm `063` on staging, same `organization_id`, wait for sync or refresh tab.

---

## Suggested order to start this week

1. Run Phase 1 manual checklist on staging (today).
2. Add Vitest + tests for `sanitizeQuantityInput` and `isPurchasingRetirementInReview` (half day).
3. Scaffold Playwright with login + PO send/review (1 day).
4. Expand Playwright as bugs are found.
