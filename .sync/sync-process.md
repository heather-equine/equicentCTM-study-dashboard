# Sales Hub public sync boundary

Effective October 4, 2026, this replaces the previous injection and sync instructions.

The GitHub Pages site is a public Overview/Activity viewer only. Preserve activity.json, activity-history.json, activity/WEEKLY_RECAP_REP.xlsx, payments.json and activity-sync.js. The React public bundle loads this data directly.

Never restore team.json, commission JSON/XLSX files, payroll ledgers, agent identity registries, plan/baseline files, sync-admin.js, invite/PIN validation, rep-lock scripts or old monolithic inline injections. Compensation and identity data belong behind authenticated, server-scoped APIs in the private dashboard. A query parameter is not authorization.

Before every public deployment run privacy_guard.py from EPL-Sales-Hub. After deployment run privacy_guard.py --network. The GitHub Actions guard also runs daily. Failed privacy checks must block restoration of old files or assets.

Public data uploads still update the public activity files. They must never publish compensation or user-identity files. No new rep or agent access has been authorized.
