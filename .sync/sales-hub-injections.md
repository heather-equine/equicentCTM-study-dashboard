# Sales Hub Required Injections

These scripts must be present in `EPL-Sales-Hub/index.html` inside `<body>` after `<div id="root"></div>`. If a rebuild of the Sales Hub wipes them, re-add both.

Canonical source: `/home/user/workspace/equicentCTM-study-dashboard/.sync/sales-hub-scripts.html`

## Script 1: Rep-Lock

Reads `?rep=karin` or `?rep=megan` URL param to auto-select a rep tab and hide others. Also hides Admin/Edit unless `?admin=true` is present.

## Script 2: Interactive Commission Table

Converts the Monthly Revenue Trajectory table into editable CTM vials + maintain units inputs with live commission recalculation (tiered: 5%/6%/7.5%/10%).

## Sync cadence

Checked once per day at the start of the first message in the equicentCTM dashboard task thread.
