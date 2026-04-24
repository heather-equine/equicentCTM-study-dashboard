# Sales Hub Required Injections

Files required in `EPL-Sales-Hub/` repo root:
- `payments.json` — rep MTD collected data
- `activity.json` — full client-level activity data (aggregates + topAccounts/newClients/outstandingAR/atRiskAccounts per rep)
- `sync-admin.js` — Option C admin upload panel
- `activity-sync.js` — client-level table sync

Scripts required in `EPL-Sales-Hub/index.html` inside `<body>` after `<div id="root"></div>`:
- Rep-lock (?rep=karin|megan)
- Auto-sync from payments.json
- Inline Activity table sync (Activity Overview + Head-to-Head bars + Projected Commission MTD)
- `<script src="./activity-sync.js?v=1">` reference
- `<script src="./sync-admin.js?v=1">` reference

Canonical source: `.sync/sales-hub-scripts.html`

## Sync cadence
Daily check at ~8am CDT restores any wiped scripts. If the Sales Hub is rebuilt
and wipes these injections, either:
1. Wait for the daily cron
2. Message in the dashboard task thread to sync manually
