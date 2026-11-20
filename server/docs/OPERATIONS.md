# Running it day to day

You normally have nothing to do. The PC:
- starts everything by itself after a restart
- makes a backup every night
- sends your data to the Mac once a day, and the whole server (app, settings, data) once a week, through Tailscale, as soon as the Mac is awake (once `install-weekly-safeguard` has been run)
- checks itself every hour
- tells you (Windows notification, and a red banner in the app on every device) when something needs you, with what to do

Every script below is a `.bat` in `Documents\todo-server\scripts\`. Double-click it. Those that need admin rights ask for them. Each run writes a log in `logs\`.

## Updating

| What | How |
|---|---|
| **The app** (new version from Claude: `app-next.zip` in `todo-server\`) | **Automatic** once `install-auto-update` has been run: within 1–2 minutes the PC installs it by itself (task "Tasks auto-update"), so Claude can update from any device. Without it: double-click `scripts\deploy-app.bat` on the PC. It keeps the previous version (`rollback-app` puts it back) and restarts the app server. **The Mac and the phone then update themselves** within 10 minutes (or as soon as you open the app), nothing to do there. |
| **The server tools** (health check, scripts) | Nothing: Claude puts them in place, they are used at their next run. |
| **Vikunja** | When Help > Status shows "Vikunja version": `scripts\update-vikunja.bat` (tests on a copy first, goes back by itself if anything fails), or ask Claude: it can request it (see below). |
| **Windows, Tailscale, Python** | As usual. After a big Windows update, run `repair-services` if Help > Status shows a missing task. |
| **Mac quick capture and folder automations** | Only when Claude sends new ones (`send-to-mac` puts them in the Mac's Downloads). |

## Updates without you at the PC (since 22 Oct 2026)

Run `install-auto-update` once (as administrator). The scheduled task "Tasks auto-update" (SYSTEM) then checks every minute and does nothing unless something is waiting:

| Waiting | What happens |
|---|---|
| `app-next.zip` in `todo-server\` | `deploy-app` runs (previous version kept; put back by itself if the new one does not answer). A file that is not an app build is set aside as `app-next-refused-<time>.zip`. |
| A new `docs\Tasks-user-guide.pdf` or `docs\Tasks-admin-guide.pdf` | A dated copy `YYMMDD_<name>.pdf` goes to `docs\guides-archive\` and to the Mac's outbox, and "Tasks weekly safeguard" is started at once to send it (the Mac gets it in Downloads when awake; otherwise retried every hour). Dated names: an older copy is never replaced, nothing deletes them. |
| `requests\<name>.request` | `scripts\<name>.ps1` runs, for these only: `update-vikunja` (the file may hold a version like `v2.8.0`), `restart-server`, `health-check-now`, `repair-services`, `backup-now`, `rollback-app`, `create-user` (the file holds `username|e-mail`; the PC makes a random temporary password and sends it only to the Mac's Downloads as `YYMMDD_Tasks-account-<username>.txt`, never into a log or a result). Anything else is refused. `rollback-vikunja` is not on the list: it asks you to confirm at the PC. |

Results: `requests\<name>.result.txt`, `state\auto-update-last.txt`, `state\auto-update-history.log`, the usual log of each script in `logs\`, and a line **Auto-update** in Help > Status (a warning if the last one failed).

How you use it: from the Mac or the phone, ask Claude in a conversation linked to this PC (the PC must be on, with the Claude app open). Claude puts the files in place, the PC applies them within 2 minutes, and Claude reads the result. Switch it off: `uninstall-auto-update`.

## Leaving the PC and managing everything from the Mac

Once, at the PC:
1. `install-auto-update` (administrator).
2. Charger plugged in. Lid closed is fine on mains power (`repair-services` sets "do nothing"; it can be requested from the Mac).
3. Windows: Settings > Accounts > Sign-in options > "Use my sign-in info to automatically finish setting up after an update": On. Settings > Windows Update > Advanced options > Active hours: your usual hours.
4. Claude app: open, signed in, starting with Windows (Settings > Apps > Startup > Claude: On). The conversation linked to this PC is the one to use from the Mac.
5. Leave it locked (Windows+L), not signed out and not shut down.

In the Tailscale admin console (from any device): disable key expiry for `pc-lou`, otherwise Tailscale asks to sign in again on the PC after a few months.

Still needs someone at the PC: `rollback-vikunja`, `restore-backup`, signing in to Windows after a full shutdown or a power cut, signing in to Tailscale again.


| Script | When | What it does |
|---|---|---|
| `health-check-now` | You want to know if all is well | Runs every check now and opens the report |
| `restart-server` | Something does not work: **try this first** | Stops and restarts Vikunja and the app, switches the public addresses back on, runs a health check |
| `repair-services` | A scheduled task is missing or disabled, after a big Windows update, or after moving PC | Re-creates every scheduled task, Tailscale settings, Funnel and power settings, then restarts. Safe to run any time |
| `backup-now` | Before doing something risky by hand | Backs up the database now |
| `install-weekly-safeguard` | Once (again after a new PC or a new Mac) | Sets up the copies to the Mac through Tailscale (to its Downloads): the database once a day, the full server every Sunday, retried every hour while the Mac sleeps. Makes the first full copy now |
| `weekly-safeguard` | Before a risky change, or if the health check says the off-PC copy is late | Makes a full copy now and sends it to the Mac (or keeps it waiting if the Mac sleeps) |
| `export-for-new-pc` | Moving to a new PC | One zip in `Documents` with everything to rebuild the server (the same zip the weekly copy sends to the Mac) |
| `restore-backup` | Data was lost or damaged | Lists backups, puts the chosen one back. The current database is kept first, so this can be undone |
| `update-vikunja` | The health check says a new Vikunja is available (it marks security releases as a problem) | Safe update: downloads, verifies, **tests on a copy of your data**, switches, verifies again; goes back by itself if anything fails |
| `rollback-vikunja` | After an update, something is wrong | Previous Vikunja and the database from just before the update. Asks for confirmation |
| `deploy-app` | Claude gave you a new version of the app (`app-next.zip` in `todo-server\`) | Installs it, keeps the previous one, goes back by itself if it does not answer |
| `install-auto-update` / `uninstall-auto-update` | Once, to let Claude update without you at the PC / to stop that | See "Updates without you at the PC" |
| `rollback-app` | The new app version has a problem | Puts the previous version back (run it again to undo) |
| `install-windows-quick-capture` | Once | Ctrl+Alt+T → "New task" box |
| `diagnose-power` | The PC was asleep, off or restarted on its own | Read-only: every sleep, wake-up and restart of the last 10 days with its reason, plus the power settings |
| `fix-after-outage` | Once (18 Oct) | New app (30-day sessions), automations restarted, alerts installed, health check |
| `install-alerts` | Once | Windows notifications for the ntfy alerts of your other devices, plus a test alert |
| `install-automations` | Once, or to update them | Installs the GTD automations, switched off: token, memory, tests, read-only check, scheduled task |
| `start-automations` / `stop-automations` | When the Mac has switched to "folders only" / to give them back to the Mac | Switches the automations on or off on this PC ([AUTOMATIONS.md](AUTOMATIONS.md)) |
| `fix-quick-capture` (now in `setup-history\`) | Done (10 Oct) | Restart + new app + Ctrl+Alt+T on the local address (fixes "500 Internal Error") |
| `cleanup-pc` / `cleanup-pc-apply` | Once after the move, then every few months | Lists, then moves, leftovers to `_to_delete\` (never deletes). Also: script logs over 90 days, older settings copies, old downloaded Vikunja versions, pre-update database copies over 60 days |
| `cleanup-pc-empty` | After checking `_to_delete\` | Sends `_to_delete\` to the Windows Recycle Bin, after you type YES |
| `export-for-new-pc` | Before changing PC, and once in a while as an off-PC copy | One zip with everything needed to rebuild the server |
| `setup-new-pc` | On the new PC | See [MOVE-TO-NEW-PC.md](MOVE-TO-NEW-PC.md) |
| `create-user` | You want to give someone an account | See [SHARING.md](SHARING.md) |
| `make-starter-kit` | Someone wants their own server | A zip without any of your data. See [SHARING.md](SHARING.md) |

## Updates — what updates itself and what does not

| What | How it is kept up to date |
|---|---|
| **The app on your devices** | By itself: when `deploy-app` installs a new version, each device gets it the next time it opens the app ("A new version is ready – Reload"). |
| **Vikunja** (security matters: the server is public) | The hourly check compares your version with the latest release: a warning when one is out, a **problem** when its notes mention security. Then run `update-vikunja`. It refuses to switch if the new version breaks anything the app uses. |
| **Tailscale** | Updates itself (turned on by `repair-services`). |
| **Windows** | Leave Windows Update on. Restarts are fine: everything comes back by itself (the health check reports it if not). |
| **Python** (runs the app server, backups, checks) | Rarely needed. If you install a newer Python, run `repair-services` (it finds it). |

### Why the app follows Vikunja updates safely

- The app uses only Vikunja's public REST API, not its database, and does not depend on Vikunja's own web pages.
- The health check verifies, every hour, that every field and endpoint the app relies on is still there: task fields, pagination, saved filters, labels.
- `update-vikunja` runs those same checks on the **new** version with a copy of your data **before** switching. If Vikunja changes its API, you stay on the working version, and the log says exactly what changed: give it to Claude to adapt the app.

## Notifications — how you hear about problems

| Where | How | Set-up |
|---|---|---|
| **In the app, on every device** | Red banner on top (tap it for details) + Settings > Server health with the fix for each problem | Nothing to do |
| **Windows notification on the PC** | When a check gets worse, and once when all is fine again (never repeated every hour) | Set up by `repair-services` |
| **Report** | `state\health-report.html` (opened by `health-check-now`), history in `logs\health.log` | Nothing to do |
| **ntfy alerts** (topic in `state\ntfy-topic.txt`; it works like a password) | One channel for every device. **The PC sends** a server problem or recovery (tagged `pc`), only when the status changes. **The app sends**, from the phone, the Mac or any other device: sync stuck for 15 minutes, or signed out by the server (tagged `phone`, `mac`, `windows`, or `pc` for the app on this PC). Each problem is sent once. A device with no network sends nothing; the app sends only while it is open. Messages are generic: never a task, project or server detail. | **Phone:** ntfy app, subscribe to the topic. **Alerts from the app:** in the app, Settings > Alerts, paste the topic, Save (it is kept in your account, and your other devices follow). **PC:** `scripts\install-alerts.bat` |
| **Windows notification for alerts from the phone and the Mac** | Scheduled task "Tasks alerts" (you, hidden, from log-on). It checks the topic every 30 s and skips alerts tagged `pc`, which the notifier already shows. Log: `logs\alerts-listener.log` | `scripts\install-alerts.bat` (sends a test alert); `repair-services` re-creates it |

## The read-only token of the health check

`state\api-token.txt` holds a Vikunja API token with **read** permissions only. It lets the check test the API like the app does. Without it, the check still runs but cannot test API compatibility.

To create one:
1. In `https://pc-lou.tailc45f62.ts.net`, sign in and go to Settings > API Tokens.
2. Give it read permissions only: Tasks, Projects, Labels, Filters.
3. Set a far expiry date.

The health check tells you when it expires.

## Where things are logged

| Log | Contains |
|---|---|
| `vikunja\vikunja.log` | The server (`restart-server` starts a fresh one when it passes 50 MB, keeping `.old`) |
| `logs\health.log` | One line per hourly check |
| `logs\<script>-<date>.txt` | Every script run |
| `backups\backup.log` | Every backup, with its integrity result and task count |
