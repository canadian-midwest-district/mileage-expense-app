# CMD Mileage & Expense Claim

A mobile-first web app for **Canadian Midwest District (CMD)** staff to log district vehicle trips and submit personal travel expense claims — writing directly to SharePoint lists via Microsoft Graph API.

**Live site:** [travel.canadianmidwest.ca](https://travel.canadianmidwest.ca)

---

## What It Does

CMD staff travel frequently across the district visiting churches. This app provides two workflows:

### District Vehicle Trip Logging
- Select a district vehicle (White Lightning, Silver Bullet)
- Enter current odometer reading — app auto-fetches the previous reading from SharePoint and calculates km driven
- Select churches visited from the Master Church List (searchable, multi-select)
- Enter trip purpose and date
- Submits directly to the **District Vehicle Logs** SharePoint list

### Personal Vehicle Expense Claims
- Multi-day trip support with per-day mileage entries
- Additional expense line items (meals, accommodation, etc.)
- Running total calculation
- e-Transfer preference toggle
- Submits to the **Travel Expense Claims** SharePoint list

### Personal Vehicle (No Claim)
- For logging trips in personal vehicles where no expense claim is needed
- Records the trip for mileage tracking purposes without generating a claim

---

## How It Works

```
User (mobile browser)
  |
  |  MSAL.js — Microsoft 365 sign-in
  v
Microsoft Graph API
  |
  |  Sites.ReadWrite.All
  v
CMD SharePoint Site
  ├─ District Vehicle Logs (list)
  ├─ Travel Expense Claims (list)
  └─ Master Church List (read-only, for church picker)
```

- **Authentication:** MSAL.js with Azure AD delegated permissions — users sign in with their Microsoft 365 account
- **Data storage:** All data writes go directly to SharePoint lists — no intermediate database
- **Odometer lookup:** Fetches all items from the District Vehicle Logs list, filters by vehicle name, and sorts by trip date to find the most recent reading
- **Church picker:** Loads the Master Church List from SharePoint with search filtering

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Frontend | Single-file HTML/CSS/JavaScript (no framework) |
| Auth | [MSAL.js 2.x](https://github.com/AzureAD/microsoft-authentication-library-for-js) (Azure AD) |
| API | [Microsoft Graph API v1.0](https://learn.microsoft.com/en-us/graph/overview) (SharePoint lists) |
| Hosting | GitHub Pages (static site) |
| Domain | `travel.canadianmidwest.ca` via CNAME |

---

## Project Structure

```
index.html      # Entire application — HTML, CSS, and JavaScript in one file (~1,670 lines)
cmd-logo.png    # CMD branding for header
CNAME           # GitHub Pages custom domain (travel.canadianmidwest.ca)
```

This is intentionally a single-file app — no build step, no dependencies, no node_modules. It loads MSAL.js from CDN. This makes it trivially deployable and easy to maintain.

---

## District Vehicles

Vehicles are configured in the `DISTRICT_VEHICLES` array near the bottom of `index.html`:

```javascript
const DISTRICT_VEHICLES = [
    { nickname: 'White Lightning', details: '2024 Toyota Camry – SK 913 NFQ' },
    { nickname: 'Silver Bullet',   details: '2019 Toyota Camry – SK 014 LPY' },
];
```

To add a new vehicle, add an entry to this array. The nickname must match exactly what appears in the SharePoint list.

---

## Azure AD Configuration

| Setting | Value |
|---------|-------|
| Tenant ID | `ba036f76-a076-48ce-99a9-a04156055259` |
| Client ID | `7e276b30-14b5-4ed7-9477-bf5fd1894090` |
| Permissions | `Sites.ReadWrite.All` (delegated) |

This uses the same Azure app registration as the SharePoint sync script in `pkagent-mail`.

---

## Data Flow to Dashboard

Trips logged here flow to the District Dashboard via the sync pipeline:

```
This app → SharePoint "District Vehicle Logs" list
                |
                |  sharepoint_sync.py (every 15 min)
                v
        Supabase district_mileage_logs table
                |
                |  Next.js SSR
                v
        dashboard.canadianmidwest.ca
```

---

## Deployment

Push to `main` — GitHub Pages auto-deploys. No build step required.

---

## Code Change Protocol

After any code change, always complete the full cycle:

1. **Test** — open the app in a mobile browser, verify the change works
2. **Commit** — stage changed files and commit with a descriptive message
3. **Push** — push to remote so GitHub Pages deploys

---

## Recent Changes

### 2026-06-19 (Phase 4b — Emmanuel batch visibility)
- Emmanuel's reconciliation dashboard gets a **"Batches"** button → the batch list/detail view (reused), so he can **see batch status (incl. "Approved")** and **Print** an approved batch to attach to the General Journal. The view shows a back-link ("← Receipts") and is titled "Batches" for him. **Approve / Return are now gated to the approver** (Bernie) — Emmanuel sees the same detail read-only. Answers Emmanuel's questions about seeing approval status and printing the approved batch.

### 2026-06-19 (Phase 4a — Bernie's approval dashboard)
- **View C — Batch Approval** (spec §9): on `expenses.` a `ReceiptApprover` (Bernie) is routed to a new `approvalDashboard`. Pending-approval batches list (BatchRef, period, prepared-by, counts, totals, flags, status) + History tab. Click a batch → detail modal with **totals by category**, **totals by province**, grand total, 50% GST rebate line, flag count, Emmanuel's notes, and a read-only receipts list with a "View flagged only" toggle. **Approve** sets the batch + all its receipts to `approved` (stamps ApprovedBy/At); **Return to Emmanuel** sets `returned`, records notes, and frees the receipts (clears BatchRef → back to `reconciled`) so they can be fixed and re-batched. **Print** uses a print-only CSS layout to produce a clean batch sheet to attach to the General Journal. Console routing now: accountant → reconciliation, approver → approval, neither → not authorized.

### 2026-06-19
- **Sage posting pivot: General Journal entry instead of `.IMP` import.** Confirmed with Sage that **Sage 50 Canada cannot import journal entries** (only lists / sales invoices). Replaced the `.IMP` download with a **"General Journal Entry"** action that builds a consolidated, balanced GJ entry for the selected/filtered receipts — grouped lines (DR `2082` = 50% of total GST; DR each expense account = subtotal+prov tax+tip+other 50% GST; CR each cardholder's RBC card account `2071/2072/2073/2076`) — shown in a modal with **Copy** and **Download CSV**, for Emmanuel to key into Sage's General Journal (~1 min/batch). Posting accounts confirmed against Emmanuel's chart of accounts (Sage version 33002). Emmanuel signed off on this approach.
- **Console cutover:** merged the hostname-aware `console-split` branch to main — `travel.` is now capture-only; the reconciliation console lives at `expenses.canadianmidwest.ca` (repo `receipt-console`, same `index.html`).

### 2026-06-17 (Phase 3 — Increment 3)
- **Batch creation** (spec §8.4): "Create Batch for Approval" modal — bundles the selected/filtered **reconciled, un-batched** receipts into a new `Receipt Batches` item (`BATCH-YYYY-NN`, computed totals, accountant notes, status `pending_approval`) and stamps each receipt's `BatchRef`.
- **Sage General Journal `.IMP` export** (spec §5.4 posting model): "Download Sage Import (.IMP)" builds the confirmed two-debit posting per receipt — `0.50 × GST` → `2082`, `subtotal + provincial tax + tip + other 0.50 × GST` → the category's expense account, credit the cardholder's RBC card account (`2071/2072/2073/2076` by submitter). Balances to the card total; date as MM-DD-YYYY. **DRAFT format** — the accounts/amounts are confirmed (J674) but the GeneralLedger block layout needs a Sage test-company import to lock; the format template is isolated for a one-spot fix.
- **PSB GST rebate card** (spec §8.6): live Total GST + 50% rebate for the current view, with **RC4034 CSV** export (date, vendor, ref, GST).

### 2026-06-17 (Phase 3 — Increment 2)
- **Row expand + inline editing** (spec §8.1): click any queue row to expand it — receipt image on the left (fetched via the Graph `/shares` API from the stored sharing link), full editable form on the right (vendor, date, province, subtotal/GST/prov tax/tip/total, category, flag, note). Editing province or total/tip recomputes the GST/provincial split live; Save PATCHes back to SharePoint (dates written as noon-Central to avoid UTC day-rollback). Per-row "Mark reconciled" sets status + ReconciledBy/At.
- **Bulk actions** (spec §8.2): checkbox column + select-all, a bulk bar with bulk category assignment and bulk mark-reconciled across the selection.
- **Accountant fallback entry:** a "Receipt Reconciliation" tile now shows on the vehicle screen for `ReceiptAccountant` members, so the dashboard is reachable even if the desktop auto-route is skipped.

### 2026-06-17 (Phase 3 — Increment 1)
- **Phase 3 (Emmanuel's reconciliation dashboard) — Increment 1.** Added the desktop `reconciliationDashboard` view (spec §8): loads all `Receipt Claims` items via Graph and renders a full-width queue table (Status, Ref, Date, Vendor, Province, Submitter, Category, Subtotal, GST, Prov Tax, Tip, Total, Flag) with color-coded status badges. Status tabs (All / Submitted / Reconciled / Flagged), click-to-sort columns, and date-range / submitter / category filters. **Inline province correction** recomputes the GST/provincial split from the tax-inclusive base (statutory rates per §5.4) and PATCHes the item back to SharePoint. Role routing now sends a desktop `ReceiptAccountant` (Emmanuel) straight to the dashboard on login. Still to come: row-expand inline editing + bulk actions (Increment 2); batch creation + General Journal `.IMP` export + PSB rebate card (Increment 3).

### 2026-06-16
- **Receipt categories now sourced from the real CMD chart of accounts.** Replaced the placeholder fallback GL codes (5210 Fuel, 5220 Meals…, which don't exist in the books) with the 6 active tiles seeded into `Receipt Category Quick Picks` (5576 Travel, 5488 Hospitality, 5529 Office Supplies, 5526 IT Equipment, 5527 Licenses & Subscriptions, 5025 Auto Repair).
- **Built the spec §7.2 "Other…" searchable picker.** The category loader no longer drops `IsActive=false` rows — active rows render as quick-pick tiles, inactive rows are reachable via an "Other…" tile that opens a search box (filters all categories by label or GL code). Category selection refactored from list-index to the selected object so an "Other…" pick is robust; a "Selected: …" chip confirms the choice. The 12 search-only CMD codes (Office Equipment, Staff Training, Intl Travel, Legal, Postage, Building Repair, Workers Retreat, Assembly, Dexcom, Licensing/Nominating/Ordaining committees) are now selectable. Emmanuel curates tile-vs-search by flipping `IsActive`/`SortOrder` in SharePoint — no code change.
- **Receipt role routing (spec §4) foundation.** On login the app reads the user's Entra group membership (`/me/memberOf`) and resolves submitter/accountant/approver roles against the receipt security groups (created 2026-06-16). The "Submit a Receipt" entry is gated on `ReceiptSubmitters` membership (fails open if membership is unreadable). Desktop reconciliation/approval dashboard routing is stubbed pending those Phase 3/4 views.
- **Category picker polish.** The "Other…" search results render as the same big tap-tiles in the 2-column grid (GL code aligned right) and the search box is styled to match the tiles — no longer looks bolted on. The picker starts empty ("Start typing to search categories…") and only shows tiles once you type, matching on label or GL code. Verified end-to-end against a real AB restaurant receipt: tax-inclusive total with no GST line correctly backed out (47.04 → 44.80 + 2.24 GST, PST 0), tip on top, real GL code `5488 - Hospitality`, image stored at the spec path.

### 2026-06-14 (evening)
- Added a **Tip** field to the receipt verify form (relabeled the last field "Total paid"), populated from OCR. Submit sends `TipAmount` only when a tip is present and **self-heals** if the `Receipt Claims` list lacks a `TipAmount` column (drops it, flags the item, still saves) — so the capture flow doesn't depend on a manual SharePoint change. Pairs with the receipt-processor tip/tax-inclusive OCR fixes.

### 2026-06-14
- Phase 2 of the Receipt Processing System (DEXT replacement): added a "Submit a Receipt" tile to the vehicle picker and a 4-step mobile capture flow (camera → preview → OCR read → verify & submit) per spec §7. Compresses photos to 1200px JPEG, posts to the `receipt-processor` OCR endpoint (`receipt-processor-eight.vercel.app`), pre-fills province-aware tax fields for confirmation (province never defaults to SK; low-confidence/needs-review results raise a check banner), loads category quick-picks from the `Receipt Category Quick Picks` SharePoint list with a built-in fallback, generates `REC-YYYY-NNNN` with race retry, uploads the image to `Travel Receipts/` and creates a `Receipt Claims` item (`status=submitted`). `ReceiptDate` sent as noon Central to avoid the UTC-midnight day rollback. Commits `39b5dd5`, `39c3237`-successor. NOTE: full submit needs the `Receipt Claims` + `Receipt Category Quick Picks` SharePoint lists to exist (pending Atlas).

### 2026-06-02
- Replaced the (now 2-option) Claim Category dropdown on the external path with a segmented-pill toggle (Licensing Committee | Ordaining Council), reusing the existing `.payment-option` style for visual consistency with the Cheque/E-Transfer switch. Neither option is pre-selected — submitter must make an explicit pick or `Please select a claim category` toasts on submit. Authenticated staff still see the original 4-option dropdown. Commit `39c3237`.
- Restricted the external Claim Category to only Licensing Committee + Ordaining Council (was: all four staff categories). Last week a council member filed their mileage under Employee Mileage by mistake, routing into the wrong approval chain. Server-side allow-list in `mileage-claim-external` enforces the same restriction so the misrouting can't recur via direct API. Commit `9a00014`.

### 2026-05-26 (evening hotfix)
- A council member trying the M365 sign-in path hit `Cannot read properties of undefined (reading '0')` — Graph returned an error envelope and the next line blind-accessed `lists.value[0].id`. Guarded the authenticated path to detect the empty/missing `value` array and throw a clear message pointing the user to the external link. Also restructured the login screen so the "File a claim without signing in →" button is the orange primary CTA with a yellow callout addressed to OC/DLC members, and "Sign in with Microsoft" is demoted to a secondary outline button labeled for staff. Commit `712a570`.

### 2026-05-26
- Added unauthenticated submission path for Ordaining Council and District Licensing Committee members who don't have CMD Microsoft 365 accounts. New "File a claim without signing in →" link on the login screen drops users into the personal-vehicle claim form with a name/email capture card. Submit posts to `mileage-claim-external` edge function (district-tracker Supabase) which writes to the same `Travel Expense Claims` SharePoint list authenticated users hit, flagged in Notes with `[EXTERNAL SUBMISSION — verify identity before approval]` and ` (external)` appended to Title. Receipts not supported on this path (no SharePoint drive write without a user token); external submitters with receipts are prompted on the success screen to email them to the approver. Commit `5afa7f6`.

### 2026-05-06
- Fixed previous-odometer auto-fill on multi-stop driving days. The client-side sort used `TripDate` only, so when two list items shared a date the "latest" reading was non-deterministic (Graph return order). Now tiebreaks by `OdometerReading` desc — higher odo is by definition the later trip in the chain. Surfaced when Bernie's 2026-04-27 White Lightning entries (Winnipeg First Nations 71551 → Saskatoon New Life 72115) caused the form to auto-fill 71551 instead of 72115. Commit `7c1a97c`.
