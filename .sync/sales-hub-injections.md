# Sales Hub Required Injections

Scripts that must be present in `EPL-Sales-Hub/index.html` after `<div id="root"></div>`.

Canonical source: `.sync/sales-hub-scripts.html`
Also required: `EPL-Sales-Hub/payments.json` at repo root.

## Script 1: Rep-Lock
`?rep=karin|megan` URL param auto-selects rep and hides others.

## Script 2: Auto-Sync from payments.json
Fetches `payments.json` and patches MTD Collected + projections in DOM for active rep. Re-runs on rep tab click.

## History
- 2026-04-20: Added rep-lock
- 2026-04-23: Sales Hub redesign — removed commission table script, added payments.json auto-sync
