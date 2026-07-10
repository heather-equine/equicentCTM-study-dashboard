# How to Update a Quality Document (IFU, Certificate, Freezer Guide)

The dashboard is a static GitHub Pages site. Quality documents live in the `docs/`
folder, and the tab links to them from `index.html`. To swap in a new revision:

## Step 1 — Add the new PDF
1. Go to the `docs/` folder in GitHub.
2. Click **Add file → Upload files** and upload the new PDF.
3. Use a clear, versioned filename, e.g. `CTM-Suspension-IFU-Rev04.pdf`.

## Step 2 — Point the tab to the new file
In `index.html`, find the relevant sub-tab section:
- **IFU** → search for `sub-ifu-instructions`
- **Certificate of Processing** → search for `sub-ifu-certificate`
- **Stirling Freezer Guide** → search for `sub-ifu-stirling`

Then update THREE things in that section:

1. **The revision/date line** (the `<p>` under the heading), e.g.
   `250.101.P01 — CTM Suspension IFU • Rev 04 • Effective MM/DD/YYYY`

2. **The "View PDF" link** — the first `<a href="docs/...">`
   Change it to your new filename, e.g. `docs/CTM-Suspension-IFU-Rev04.pdf`

3. **The "Download" link** — the second `<a href="docs/...">`
   Same new filename.

## Step 3 — (Optional) Update the inline text
The IFU tab also shows the document text inline (below the buttons). If the new
revision changed any wording (e.g., storage temp, needle gauge, dosage), update
the matching `<div class="ifu-section">` blocks so the on-page text matches the PDF.
If only the PDF changed and the text is the same, you can skip this.

## Step 4 — Remove the old PDF (optional, keeps the folder tidy)
Delete the previous revision's PDF from `docs/` once nothing links to it.

## Step 5 — Save / commit
Commit the changes to the `main` branch. GitHub Pages redeploys automatically
within 1–2 minutes. Hard-refresh the live site to see updates.

---
Live site: https://heather-equine.github.io/equicentCTM-study-dashboard/
Last IFU update: Rev 03 — Effective 06/24/2026
