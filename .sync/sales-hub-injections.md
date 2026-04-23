# Sales Hub Required Injections

These scripts must be present in `EPL-Sales-Hub/index.html` inside `<body>` after `<div id="root"></div>`.

Canonical source: `/home/user/workspace/equicentCTM-study-dashboard/.sync/sales-hub-scripts.html`

## Script: Rep-Lock

Reads `?rep=karin` or `?rep=megan` URL param to auto-select a rep tab and hide others. Also hides Admin/Edit unless `?admin=true` is present.

## History
- 2026-04-20: Added rep-lock + interactive commission table
- 2026-04-23: Sales Hub rebuilt with new projection-based design. Interactive commission table script removed (obsolete — new design uses automated projections from uploaded payment files). Rep-lock retained.

## Sync cadence

Checked once per day. If rebuild wipes the rep-lock script, auto-restore from canonical source.
