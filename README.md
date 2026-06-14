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
