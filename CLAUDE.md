# CLAUDE.md — Ayush360 HMS Frontend

Guidance for Claude (and developers) working in this repository. Read this first, then
`docs/PROJECT-OVERVIEW.md` for product decisions, workflow and the API contract.

## What this is

Ayush360 is a multi-hospital (multi-tenant) Hospital Management System sold **module by module**.
This repo is the single React frontend. The backend (ASP.NET Core modular monolith + PostgreSQL)
is being built separately; until then an in-browser **mock API** stands in for it.

Stack: React 19 · TypeScript (strict) · Vite · React Router 7 · plain CSS (no UI library) · font Plus Jakarta Sans.

## Commands

```bash
npm install
npm run dev               # http://localhost:5173 (mock API on by default)
npm run build             # check:boundaries + tsc + vite build — must pass before handing over
npm run typecheck         # tsc only
npm run check:boundaries  # module import rules (scripts/check-module-boundaries.mjs)
```

Demo logins (mock, password `demo123`, usernames case-insensitive): `DN10110`, `HA10120`, `PS10210`, `SR10310`.
Reset mock data: run `resetMockDb()` in the browser console. Bump `STORAGE_KEY` in `src/mock/mockDb.ts`
whenever seed data or stored shapes change.

## Structure

```
src/
  core/       platform: api/httpClient, authentication, tenant, permissions, modules (registry + manifest types),
              routing, layout. Shared by all modules.
  modules/    one folder per sellable product: registration (Front Desk), billing, doctor, nurse,
              pharmacy, lab, payroll. Each has manifest.ts + index.tsx (+ api/, components/, hooks/, pages/, types.ts).
  shared/     generic UI (FormField, Modal, Icons, …) and utils (format, validation). No business logic.
  mock/       dev-only backend (mockServer.ts router, mockDb.ts seed). Lazy-loaded; never import from modules.
docs/         PROJECT-OVERVIEW.md (decisions, workflow, API, change log) + screenshots
```

## Non-negotiable rules

1. **Tenant comes from the server.** Never send `tenantId` from the client; never let the UI switch tenant.
   `useTenant()` is read-only and for display/licensing only.
2. **Frontend hiding is UX only.** Every licence/permission check in the UI must also be enforced by the API.
3. **Module boundaries.** A module never imports another module. `core/` and `shared/` never import modules
   (only `core/modules/registry.ts` imports each `manifest.ts`). `shared/` never imports `core/`.
   Modules talk to each other only via the API. Run `npm run check:boundaries`.
4. **Adding a module:** add code (+ permissions) in `core/permissions/permissions.ts` → create
   `modules/<name>/index.tsx` (own `<Routes>`) and `manifest.ts` (code, name, basePath, requiredPermissions,
   accent, navSection, nav, lazy `load`) → add to `MODULES` in `core/modules/registry.ts`. Do not edit routing or sidebar code.
5. **All HTTP goes through `core/api/httpClient.ts`** (adds Bearer token + `X-Correlation-ID`, handles 401/403).
   Each module wraps endpoints in its own `api/*.ts`. Keep the mock (`src/mock/mockServer.ts`) in sync with any
   new/changed endpoint and document it in `docs/PROJECT-OVERVIEW.md` §6 and README.
6. **No PHI in logs** (no `console.log` of patient data).

## Front Desk / Registration rules (agreed with product owner)

- **One screen**, no New/Returning toggle, no locked fields. Search loads the patient into the same editable form:
  - nobody selected → new patient + new visit → **Registration**
  - existing patient, no open visit today → details editable, visit empty → **Registration** (or **Save patient details**)
  - existing patient with an **open visit** (today, Waiting/In consultation) → patient + visit editable → **Save changes** (no new visit/charge)
- A patient may have **several open visits today** (different doctors): the Today's visits switcher picks which one the form edits; Visit history lists all visits (open ones clickable).
- **Payment before registration**: visit, receipt and token are created only after payment succeeds (single API call).
- **Free follow-up**: same doctor within the hospital's `followUpFreeDays` of the last *paid* visit → fee ₹0, no payment step.
  The server decides (`GET /registration/fee-quote`); the client only displays it.
- Server refuses: a second open visit with the same doctor on the same day; changing doctor on an open visit if the fee would change.
- **Age** is required (stored as DOB; typed age sets an estimated DOB with `dobEstimated = true`).
- **Payer**: Self or Insurance (insurer from suggestions or free text, policy no., holder, relation required). OPD fee is still collected.
- **Collections**: receptionists see only **My collection** (their receipts); hospital total needs `COLLECTION_VIEW_ALL` (Admin).
  Counts (registered / waiting / new) are hospital-wide and auto-refresh every 30 s.
- **Tokens / visit / receipt numbers are generated server-side**; the backend must make this atomic per hospital per day.
- **Emergency / ICU** visit types ("acute"): E-/I- token series, `registrationType` EMERGENCY/ICU, **no consultation fee** (charges billed later), optional advance/deposit (receipt + My collection), arrival time, brought by/triage (ER), ICU unit/bed/admission source + attendant (ICU), MLC with server MLC number, mobile/address optional. Cannot be converted to/from OPD.
- **Save draft** stays in the browser session only — never creates a queue entry.
- **Receipt**: one A5 page, essentials only (`RegistrationReceipt.tsx`, printed via `.print-area`).

## UI conventions

- Use design tokens in `src/index.css` (`--primary`, `--teal`, `--amber`, `--shadow-card`, …) and existing classes
  (`card`, `btn btn-primary|secondary|ghost`, `field`, `input`, `select`, `icon-badge accent-*`, `alert-*`).
- Each module has an accent colour (manifest `accent`). Sidebar uses the page background, not white.
- Forms: `FormField` + `aria-invalid`; validation messages under the field; required fields marked with *.
- Must work at phone width (no horizontal scroll); grids use `minmax(0, 1fr)`.
- Indian context: `+91` 10-digit mobiles, ₹ via `formatCurrency`, `en-IN` dates.

## Working conventions

- Git repo: https://github.com/dhevendranoothalapat/Ayush360_FE (branch `main`). The user commits and pushes from
  `C:\Ayush360\Frontend` (`git add .` → `git commit -m "…"` → `git push`); Claude has no GitHub credentials.
- The working copy lives at `C:\Ayush360\Frontend` on the user's machine. After changing files, verify they landed
  (compare sizes/contents) — partial or stale writes have happened before.
- After each user-visible change: test the flow (desktop + phone width), then add a row to the change log in
  `docs/PROJECT-OVERVIEW.md` and update README/API tables if endpoints changed.
- Keep replies to the user short and non-technical; they review in the browser.
