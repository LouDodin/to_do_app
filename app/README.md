# Tasks — the app (source)

Custom installable web app (SvelteKit + Dexie/IndexedDB, PWA) for a Vikunja server. The user
documentation lives in `Documents\todo-server\docs\` on the server PC; this file is for changing the app.

**Rule (26 Oct 2026): every change updates both guides** — `guide/guide.html` → `docs/Tasks-user-guide.pdf`
(what users see) and `admin-guide/admin-guide.html` → `docs/Tasks-admin-guide.pdf` (running the server),
plus `docs/CHANGELOG.md`. Update the "Version of" date on each cover. Build the PDFs with
`node guide/to-pdf.mjs $PWD/<file>.html $PWD/<file>.pdf "<Footer label>"` and check the page breaks.

## Build and test (on any machine with Node 22)

```bash
npm ci
npm run check      # types: 0 errors expected
npm test           # unit tests (vitest, fake IndexedDB)
npm run build      # output: build/  (zip its CONTENTS as app-next.zip, then scripts\deploy-app.bat on the PC)
```

End-to-end tests (Playwright + Chromium; `npm i --no-save playwright-core`), against the built app
served by the same server as on the PC (`tools/serve_app.py`, port 5173):

| Script | Needs | Checks |
|---|---|---|
| `e2e/smoke.mjs <app>` | nothing (mock Vikunja) | 62 desktop behaviours |
| `e2e/phone.mjs <app>` | nothing (mock) | phone layout, install, offline, share target, sync edge cases |
| `e2e/health.mjs <app> <api> <jwt>` | a `state/health.json` with a failure | banner + Settings |
| `e2e/real-flows.mjs <app> <api> <jwt>` | a **test** Vikunja holding a **copy** of the data | create / move / complete / Bin / repeat / offline against real Vikunja |
| `e2e/sticky.mjs <app> <api>` | same | an Inbox task stays on screen until validated, and the trace is written |
| `e2e/oct22.mjs <app> <api> <user> <pass> <stateDir>` | test Vikunja + the app server's state folder | back after deleting; "Got it" on warnings |
| `e2e/oct22b.mjs <app> <api> <user> <pass> <servedAppDir> <buildA> <buildB> <stateDir>` | test Vikunja, two builds | recovery after an update, error page, version report, no false Inbox alarms |
| `e2e/admin-warnings.mjs <app> <api> <root>` | multi-account sandbox (LouDodin main + Alex, PC layout) | the admin sees every account's warnings (who, which device), "Got it" just me / everyone, others see only theirs |
| `e2e/install.mjs <app> <api> <user> <pass>` | test Vikunja | Help → Install the app: steps per browser on phones (Firefox, WhatsApp, iPhone), hidden once installed |
| `e2e/accounts.mjs <app> <api> <root>` | test Vikunja with a second account, the PC folder layout | automations per account (on/off from the app, one poller each, per-account checks), Download my data |
| `e2e/sw-update.mjs <app> <api> <user> <pass> <servedAppDir> <buildA> <buildB>` | two builds (`SLOW=1 PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` for a slow connection) | an open app moves to a new version |
| `e2e/real-login.mjs`, `e2e/realcount.mjs`, `e2e/real.mjs` | same | 2FA sign-in, full mirror counts, screenshots |

Never point the `real-*` tests at the live server: they create and delete tasks.

## Conventions the code relies on

- Vikunja REST API only (`src/lib/api`). Lists are paginated (50 per page, `X-Pagination-Total-Pages`).
- Vikunja clears omitted fields on update: updates always resend the task's current values (`db/sync.ts`).
- Saved filters cannot be listed on Vikunja 2.x (405): they are read one by one from their
  pseudo-projects (negative ids).
- Temporary ids for offline creations come from the clock (`db/tempId.ts`), far below the
  pseudo-project ids.
- Pro/Perso and "pending" are stored in the project description (`utils/projectMeta.ts`).
- Home blocks are defined by label *names* (`db/queries.ts`).
