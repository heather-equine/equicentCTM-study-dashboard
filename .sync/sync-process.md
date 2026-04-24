# Sales Hub Payments Sync Process

## Current state (Option A — manual file-drop sync)

**File:** `EPL-Sales-Hub/payments.json`
**Last updated:** 2026-04-23

### How it works
1. Sales Hub loads `payments.json` on page load
2. `index.html` auto-sync script reads it and patches MTD Collected + all projected comp values in the DOM
3. Active rep is auto-detected (Karin vs Megan tab selection)

### When you upload a new Received Payments file
Send both files to the main dashboard task:
- `CLIENT_ACTIVITY_Report_YYYY-MM-DD-*.csv` (or .xlsx)
- `Received_Payments_YYYY-MM-DD_to_YYYY-MM-DD.xlsx`

Agent will:
1. Parse the CSV/xlsx to extract per-rep MTD payments
2. Update `payments.json` with new values (mtdCollected, payments array, lastUpdated date)
3. Commit + push to gh-pages

## Future state (Option C — automatic API sync)
TBD — add a "Save to team" button in Sales Hub admin that commits to payments.json via GitHub API.
