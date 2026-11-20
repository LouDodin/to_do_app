# How it fits together

```
 Phone / Mac / PC (the installed app)                 The PC "pc-lou" (always on)
 ┌───────────────────────────────┐                   ┌────────────────────────────────────────────┐
 │ Tasks app (PWA)               │  https://…:8443   │ Tailscale Funnel ─┬─ :8443 → app server     │
 │  - full copy of the tasks     │ ───────────────▶  │  (public HTTPS)   │   127.0.0.1:5173        │
 │    (IndexedDB)                │                   │                   │   tools\serve_app.py    │
 │  - queue of unsent changes    │  https://…:443    │                   │   serves app\           │
 │  - works offline              │ ───────────────▶  │                   └─ :443  → Vikunja        │
 └───────────────────────────────┘                   │                       127.0.0.1:3456        │
 Mac quick capture (⌥⇧⌘T) ── API token ─────────────▶│                       vikunja\vikunja.exe   │
 Mac folder mirror (Python) ── API ─────────────────▶│                       db\vikunja.db (SQLite)│
   ↔ Partage_…/areas + weekly report                 │ Scheduled tasks (Windows):                  │
                                                     │  Vikunja · Tasks app (start-up, restart)    │
                                                     │  Vikunja backup (03:00) → backups\          │
                                                     │  Tasks health check (hourly) → state\       │
                                                     │  Tasks notifier (you, hourly) → Windows     │
                                                     │  Tasks automations (start-up, restart):     │
                                                     │   labels, dates, pending → 127.0.0.1:3456   │
                                                     └────────────────────────────────────────────┘
```

## Components

| Part | What it is | Where |
|---|---|---|
| **Vikunja** | The server: accounts, tasks, projects, labels, filters, API. Version 2.7.0 (native Windows build, no Docker). | `vikunja\vikunja.exe`, settings in `vikunja\run-vikunja.cmd`, address in `vikunja\publicurl.txt` |
| **Database** | One SQLite file holding all your data | `vikunja\db\vikunja.db` |
| **The app** | SvelteKit single-page app, installable (PWA), offline-first. It only talks to Vikunja's REST API. | built: `app\`, source: `app-source\` |
| **App server** | Small Python web server: serves `app\`, sends every unknown path to the app, serves `/health.json`, adds security headers | `tools\serve_app.py` |
| **Tailscale Funnel** | Gives the PC two public HTTPS addresses, with no router change and no VPN on the other devices | Tailscale app, configured by `scripts\repair-services.bat` |
| **Backups** | Consistent copy of the database every night (safe while running), checked, 30 days kept | `tools\backup.py` → `backups\` |
| **Health check** | Hourly read-only checks, writes `state\health.json` (shown by the app everywhere) and `state\health-report.html` | `tools\healthcheck.py` |
| **Notifier** | Windows notification when a check gets worse (once, not every hour) | `tools\notify.ps1` |
| **Scripts** | Everything you double-click (see [OPERATIONS.md](OPERATIONS.md)) | `scripts\` |

## How sync works

1. On start, and every 5 minutes, and **whenever you come back to the app**, the app sends its queued changes, then downloads everything:
   - all pages of tasks, projects and labels
   - the saved filters, one by one, since Vikunja 2.x does not list them
2. Local changes are applied on the device at once (optimistic), queued, and sent in order. Things created offline get a temporary id, which is replaced by the server's id when sent.
3. A row with an unsent change is never overwritten by the download. For the same task changed on two devices, the last change sent wins.
4. Rows that disappeared from the server are removed locally, unless they have unsent changes. If the server suddenly returns zero tasks while the device holds many, nothing is deleted.
5. If the server refuses a change:
   - **expired sign-in** or **too many requests:** the change is kept and the app retries.
   - **genuinely invalid** (for example, the task was deleted elsewhere): the change is dropped and listed in Settings > Changes.
6. **When the server is unreachable** (PC off, no network), changes wait on the device and are sent later.

## Ports and addresses

| Port | On | Reached by |
|---|---|---|
| 3456 | 127.0.0.1 only (Vikunja) | Funnel `https://pc-lou.tailc45f62.ts.net` |
| 5173 | 127.0.0.1 only (app server) | Funnel `https://pc-lou.tailc45f62.ts.net:8443` |
| 3457 | 127.0.0.1, only during an update test | nobody (test copy) |

Nothing listens on the home network. Only Tailscale reaches the two services.

## The folder

```
Documents\todo-server\
  app\                   live app            app-previous\  the version before (rollback)
  app-source\            source of the app (to change or rebuild it)
  vikunja\               server: vikunja.exe, run-vikunja.cmd, publicurl.txt, vikunja.log, db\, files\
  backups\               nightly database copies (30 days) + backup.log
  state\                 health.json, health-report.html, api-token.txt (read-only, health check),
                         automation-token.txt (automations), automations\ (their memory), python-path.txt
  logs\                  one log per script run, health.log
  tools\                 serve_app.py, backup.py, healthcheck.py, notify.ps1, hidden.vbs, tasks.ico
  automations\           the GTD automations (labels, dates, pending projects), their tests and README
  scripts\               everything you run (see OPERATIONS.md)
  mac\                   scripts to run on the Mac
  docs\                  this documentation
  setup-history\         the one-off scripts of 9-10 Oct and the overnight report (after cleanup-pc)
```

## What still runs on the Mac

- **Project folders and the weekly report** (projects ↔ folders in `Partage_One_plus_nord_CE_2/areas`): the automations with role `folders`. They stay on the Mac by design, because the folders are on the Mac. They talk to the PC server.
- The other GTD automations (next-action propagation, overdue labels, pending projects…) run on the PC since 10 Oct. See [AUTOMATIONS.md](AUTOMATIONS.md).
- **Quick capture** (⌥⇧⌘T).
