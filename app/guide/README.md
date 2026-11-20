# User guide (PDF for other users)

`guide.html` + screenshots → `Tasks-user-guide.pdf` (A4). To regenerate, against a TEST server only:
1. `node guide/demo-data.mjs <api>` (demo account "Alex", generic tasks; never real data)
2. `node guide/screenshots.mjs <app> <api> guide/` (run from the repo root, needs playwright-core)
3. `node guide/to-pdf.mjs $PWD/guide/guide.html $PWD/guide/Tasks-user-guide.pdf`

The Admin guide (for the server owner) is in `admin-guide/`: no screenshots, just
`node guide/to-pdf.mjs $PWD/admin-guide/admin-guide.html $PWD/admin-guide/Tasks-admin-guide.pdf "Admin guide"`.
Both guides are updated with every change (see the repo README).
