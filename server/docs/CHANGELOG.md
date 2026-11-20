# Changelog: everything changed, added, moved or removed

## 9 Oct 2026 (evening): server moved from the Mac to the PC

| What | Detail |
|---|---|
| Installed on the PC | Vikunja 2.7.0, the native Windows build (`vikunja\vikunja.exe`; the Mac ran 2.6.0 in Docker). Tailscale 1.104.1. No Docker, no WSL. |
| Data | Your Mac database (177 tasks of which 110 live, 39 projects, 98 labels, 24 relations, 9 saved filters, 4 API tokens). Integrity checked, merged into one file, upgraded to 2.7 automatically. Same server secret, so logins and tokens kept working. |
| Settings changed | Sign-ups closed. Sleep and hibernation off on mains power. Tailscale stays connected when nobody is logged in. Funnel on 443 (Vikunja) and 8443 (app). |
| Scheduled tasks created | Vikunja, Tasks app (start-up, restart), Vikunja backup (03:00, 30 days kept) |
| App | Built from the Mac source and served from `app\`. One change: the sign-in screen pre-filled the PC address. |
| Files received from the Mac | `Downloads\vikunja.zip`, `Downloads\tasks-app-v1-source.zip` |

## 10 Oct 2026 (overnight)

Nothing on the PC was changed while you slept. Everything below is **staged** in `Documents\todo-server` and applied by `MORNING.bat` (and the scripts it names), except the three files noted below.

**Changed directly on the PC.** These run only when started, and the new versions were tested:
- `tools\serve_app.py`: adds `/health.json` and security headers. It is used after the next restart, and works with either app version.
- `tools\backup.py`: same backup, now with an exit code, counts only live tasks, and logs failures. Used by tonight's 03:00 run.
- `tools\healthcheck.py` (new): not scheduled until `MORNING.bat`.

### App: bugs fixed

1. **The app was never installable and could not work offline.** The page did not link its manifest or register its offline worker, and the offline page was not in the offline cache. Both are fixed and tested: the app now opens with no network, which is the "PC off" case.
2. **Only 50 of your 98 labels were loaded** (the server sends lists 50 at a time). All lists now load every page: tasks, projects and labels.
3. **Deletions did not reach other devices.** A task, project or label deleted on one device stayed on the others for ever. Tasks of archived projects are kept: Vikunja does not list them, so they must not be taken for deleted.
4. **A change made while signed out was thrown away** (session expired after a long time offline). It is now kept and sent after you sign in again.
5. **Tasks created offline across an app restart overwrote each other** (temporary ids restarted at -1).
6. **First sign-in on a new device left the app empty** (or blank) until reloaded.
7. **No refresh when coming back to the app.** Changes from other devices took up to 5 min to appear. It now syncs as soon as the app is in front.
8. **Relations linked the first task whose title matched,** which could be the wrong task, a completed one, or the task itself. You now pick from a list of matching open tasks.
9. **"dans 3 jours" was never understood** in quick add (only the first word was read), and only French day names worked. English and French phrases, compact forms and times now work (see [FEATURES.md](FEATURES.md)).
10. **The cursor was not in the title field** when the new-task window opened (the start-up process took the focus back).
11. **Every sync added a refused request to the server log** (Vikunja 2.x cannot list saved filters). It is now asked at most once a day.
12. Deleting from the task page said "Delete this task?" although it goes to the Bin. Now: "Move this task to the Bin? You can restore it for 30 days."
13. Task page on a phone: the relation box was wider than the screen.
14. **Saved filters showed a blank page.** The page's source file had been emptied on the Mac on 8 Oct, so every saved filter (Available, Tomorrow, Red, Today…) opened on nothing. Rebuilt. The results now match Vikunja's own for all 9 of your filters, task by task, and they work offline.
15. The server-problem banner covered the page title on a phone. It is now a slim bar under the top bar.
16. Inbox view on a phone: for a task with a date, the validation circle dropped onto its own line. It now stays at the right of the title.
17. On a device that had not finished its first download, the Settings tools that rewrite everything (Fresh start, Merge duplicates, Send all to the Inbox view) could run on a partial copy of the data. They now wait for the first sync.

### App: new

- **Phone layout:**
  - full-width titles, with labels below and one line of project and dates
  - empty columns hidden
  - tap a task to open it, and a tapped label can no longer be removed by accident
  - round + button
  - correct screen height and notch areas
  - new-task window at the top, without keyboard hints
- **Installable app:**
  - shortcuts on the icon (New task, Weekly review, Tomorrow's priorities)
  - **Share to Tasks** on Android
  - theme colour and icons for iOS and Android
  - storage protection requested, so the browser keeps the offline copy
- **Settings:**
  - This device: install, offline status, server and version, last sync, changes waiting, build
  - Changes: waiting and refused
  - Server health
- **Server problems** shown as a red banner on every device. **"A new version is ready – Reload"** after an update.
- **Two-factor sign-in**, and clearer sign-in messages.
- The sign-in screen suggests the server matching the app's address, so it works for other people's servers too.
- Removed from the app's source: the Mac-only scripts (floating panel, LaunchAgent installer, phone-access, `new-task.sh`). They are replaced by the new quick capture and the PC hosting.
- Tests:
  - 84 unit tests (was 76)
  - desktop end-to-end suite 62/62
  - new phone suite (18)
  - new tests against a real Vikunja 2.7 with a copy of your data: sync completeness, create, move, complete, Bin, restore, repeat, offline, 2FA, project create/nest/delete, and all 9 saved filters compared with Vikunja (all passing)
- **Update procedure rehearsed** with the real programs (2.6.0 → 2.7.0 on a copy of your data, then rollback). It found and fixed two problems before you could meet them:
  - the database could have been copied while the server was still running
  - two backups made in the same minute overwrote each other

### Server and PC: new (applied by `MORNING.bat`)

- **Security:**
  - CORS limited to the app (it was `*`: any website could have used your session)
  - link sharing off
  - the server log keeps only failed requests. Every request used to be logged, about 2 GB a year
  - app security headers
  - Tailscale updates itself

  See [SECURITY.md](SECURITY.md). Previous settings are kept as `vikunja\run-vikunja.cmd.before-<date>`.
- **Hourly health check** of about 20 checks:
  - the services and the public addresses
  - Tailscale and Funnel
  - scheduled tasks, backups, disk
  - database integrity and orphans
  - server errors
  - sleep setting
  - Vikunja version vs security releases
  - API compatibility with the app

  The result reaches you in the app, as Windows notifications, and optionally on the phone via ntfy.
- **Scripts** (`scripts\`):
  - restart, repair and health check now
  - backup, restore
  - safe Vikunja update and its rollback
  - app deploy and its rollback
  - export for a new PC, new-PC set-up
  - PC clean-up
  - Windows quick capture (Ctrl+Alt+T)
  - create an account for someone
  - starter kit
- **Mac scripts** (`mac\`): report, quick capture (⌥⇧⌘T, works offline), retarget the automations, clean-up.
- **Documentation** (`docs\`): this folder.

### What the clean-up scripts move (never delete) — when you run them

**PC** (`cleanup-pc-apply`):
- The one-off setup files of 9 Oct, moved to `setup-history\`: `0-check.bat`, `check-result.txt`, `1-install.*`, `2-start-server.*`, `3-funnel.*`, `4-backup.*`, `5-app.*` and their `*-result.txt`.
- These, moved to `_to_delete\<date>\`:
  - `app-build.zip`, `app-source.zip` (already unpacked)
  - `vikunja\bin\` (duplicate of `vikunja.exe`, 46 MB)
  - `Downloads\vikunja.zip` (Mac copy, contains the server secret)
  - `Downloads\tasks-app-v1-source.zip`
  - the Tailscale installer in Temp
  - later on: old downloaded Vikunja versions (the two newest are kept), database copies from before updates or restores older than 60 days, failed or rolled-back app folders

**Mac** (`mac/3-cleanup.command apply`). These are moved to `~/_to_delete/<date>/`:
- the LaunchAgent `com.tasks-app.dev`, stopped first (the old app server)
- `~/vikunja` (old server data of 9 Oct, also archived as a `.tar.gz`)
- `~/Downloads/tasks-app-v1-source`
- any `ongoing_projects` / `pending_projects` folder outside `Partage_One_plus_nord_CE_2/areas` (mirrors of older app versions)
- leftover zips and `start-tasks-app.command`

It also resets **Tailscale serve** on the Mac (the old `macbook-pro-de-lou…` addresses), and **removes the Docker container and image** (re-downloadable). Tailscale itself is kept.

It never touches `Partage_One_plus_nord_CE_2/areas` or `~/vikunja-automation`.

**Phone** (by hand): the old home-screen icon for the Mac address, and the HTTP Shortcuts widget.

## 10 Oct 2026 (morning): Ctrl+Alt+T fix

Applied by `scripts\fix-quick-capture.bat`.

- **Ctrl+Alt+T showed "500 Internal Error".** The server answered correctly; the browser on the PC could not use the PC's own public address. The shortcut now opens the app's local address, `http://127.0.0.1:5173/quick-add`.
- `vikunja\run-vikunja.cmd`: CORS also allows `http://127.0.0.1:5173`. Only programs on this PC can use that address.
- App:
  - the quick-capture window has its own sign-in. It used to jump to the full sign-in page, then to the main app.
  - on the local address, the server field is filled in with `http://127.0.0.1:3456`.
- `tools\serve_app.py`: a missing file (for example an old app file after an update) now gets a real "not found", never cached. It used to get the app page, which browsers cannot run, and that showed "500 Internal Error".
- Tests:
  - unit 84/84
  - desktop 62/62
  - phone 18/18
  - local quick capture end to end against Vikunja 2.7: sign in, add, saved on the server, the next open goes straight to the box

## 10 Oct 2026: new icon

- **New app icon:** "To" over "Do" in white on a blue gradient. It is used for the app icon, the browser tab, the iPhone home screen and the Android round icon (with the text kept inside the safe area).
- The Ctrl+Alt+T shortcut uses the same icon (`tools\tasks.ico`).
- Applied by `deploy-app.bat`, then `install-windows-quick-capture.bat` for the shortcut.

## 10 Oct 2026: clean-up extended

`cleanup-pc` now also moves:
- to `setup-history\`: `MORNING.*`, `REPORT-2026-10-10.md` and `fix-quick-capture.*` (done; kept for reference)
- to `_to_delete\`:
  - `vikunja\run-vikunja.cmd.next` when it is the same as the installed file
  - older copies of the server settings (the newest is kept)
  - script logs over 90 days
  - a stale PowerPoint lock file in Downloads (`~$GPROD_…pptx`, Nov 2023)

New `cleanup-pc-empty`: sends `_to_delete\` to the Recycle Bin after you type YES.

Not touched: Syncthing's `Sync` folder in your user folder, which is not part of this set-up. Uninstall Syncthing from Windows Settings > Apps if you no longer use it.

## 10 Oct 2026: GTD automations moved to the PC

From the Mac package `vikunja-automation-for-pc.zip`. Details in [AUTOMATIONS.md](AUTOMATIONS.md).

**On the PC:**
- `automations\`: the poller with roles, its supervisor (`run_poller.py`), health check, tests, the Mac's memory (`initial-state\`) and the original README.
- Scheduled task "Tasks automations", installed switched off.
- New scripts: `install-automations`, `start-automations`, `stop-automations`.
- `state\automation-token.txt`: the token, out of the code and locked down.
- Changed:
  - health check: three automation lines
  - `update-vikunja`: runs an automation cycle on the test copy
  - restart, update, rollback and restore stop the automations while the server is down
  - `repair-services` re-creates the task
  - `export-for-new-pc` includes them (switched off)
  - `cleanup-pc` moves the Mac package out of Downloads once they run here

**For the Mac:** `automations-for-mac.zip` (also in `mac\automations-for-mac\`). The same code with role `folders`, and `MAC-SWITCH.md` for the Mac session.

**Fixes in the automations:**
- Windows: UTF-8 and time zone.
- A task completed in the same second as the previous check could be missed (2-minute overlap).
- Server errors are retried once.
- State files are written atomically.
- Links between tasks in the Bin were reported as dangling.

**Tests:** 67 unit tests, plus 11 real scenarios against Vikunja 2.7 on a copy of this morning's data. All pass.

**Found in your data (not changed):** the saved filter "Groceries" uses label ids 78 and 101, which no longer exist, so it shows nothing. Label `grocery-store` (id 171) exists.

## 10 Oct 2026: automations switched on

- The Mac runs "folders only"; the PC runs the label / date / pending automations since 10:36. First cycle without a problem.
- `cleanup-pc` now also moves, once the automations run on the PC:
  - to `_to_delete\`: both automation zips in Downloads
  - to `setup-history\`: `automations\initial-state\` and `mac\2-retarget-automations.command`

## 10 Oct 2026: alerts through ntfy

- `state\ntfy-topic.txt`: topic `tasks-lou-…` (the full name is in the file; keep it private: anyone with it can read and send alerts).
- **The PC health check's ntfy alerts** are now generic ("details in the app") and tagged `pc`. If Python cannot reach ntfy, Windows' curl sends them.
- **Windows listener:**
  - new `tools\ntfy-listen.ps1` and the scheduled task "Tasks alerts" (as you, from log-on, brought back every hour if it stopped)
  - shows the alerts sent by the phone, the Mac and other devices; skips those tagged `pc`
  - never shows alerts older than 12 hours
  - log in `logs\alerts-listener.log`
  - installed by `scripts\install-alerts.bat`, and by `repair-services` when the topic file exists
- **App:**
  - Settings > Alerts: topic, Save (kept in your Vikunja account, so every device follows), Send a test.
  - Sends one alert when sync has failed for 15 minutes, or when the server ended the session. Signing out yourself sends nothing.
  - A device with no network does not count as stuck.
  - Tagged with the kind of device. Generic text.
  - Tests: 93 unit tests, 12 alert end-to-end tests against Vikunja 2.7, desktop 62/62, phone 18/18.

## 18 Oct 2026: the week of 10-18 Oct, and its fixes

**What happened:**
- **10 Oct 13:01 and 14 Oct 01:47:** the PC restarted unexpectedly. The first restart left one automation state file full of zero bytes. From then on, one automation step (tracking tasks newly put in pending projects) failed every minute, 5,900 times. The other automations kept working.
- **14 Oct 13:07 to 17 Oct 22:58 (82 h):** the PC was asleep. Vikunja did not restart, so it was not switched off. No device could sync.
- **Sessions:** a session lasted 3 days without contact with the server.
  - The phone was signed out when the PC woke up. Seven of its tasks had reached the server; the rest are still kept on the phone.
  - The Mac had been signed out since 11 Oct (not opened for 3 days).
- No data was lost on the server. The nightly backups are all intact, but none was made during the sleep.

**Fixes:**
- App:
  - sessions now last **30 days** without contact with the server (`long_token`)
  - the sign-in page says how many changes are kept on the device and will be sent after sign-in
  - new test: a phone captures tasks while the server is unreachable, its session expires, it signs in again, and every capture reaches the server once
- Automations:
  - a damaged state file is detected and started again without changing any date
  - state files are forced to disk before they replace the old one
  - "nothing pending" is no longer confused with "unknown"
  - `errors.log` rotates at 2 MB
  - 71 tests
- Health check: new **Interruptions** line. A period of more than 2.5 h without a check (PC asleep or off) is reported for a day, with what to do.
- New scripts:
  - `diagnose-power` (read-only: sleeps, wake-ups, restarts and their reasons, power settings)
  - `fix-after-outage` (new app, automations restart with the old error log archived, alerts, health check)
- The ntfy alerts prepared on 10 Oct were never copied to the PC, because the PC was unreachable that day. They are installed now.

## 19 Oct 2026: after the repair

- **Phone:** its 45 waiting tasks reached the server on 18 Oct at about 21:00, with no duplicates. The Mac and the PC are signed in again. The health check has been OK every hour since.
- **Cause of the sleeps:** the server is a laptop, and at the 18 Oct check it was running on battery. Windows put it to sleep on 10 Oct 15:25 and 14 Oct 14:04 even though "sleep after" is set to never, and the unexpected restart on 10 Oct 13:00 fits a battery that ran out. The two night restarts (10 and 14 Oct) were Windows Update.
- **New health check line "Power":** a problem as soon as the laptop runs on battery. That status change is also pushed to your phone through ntfy.
- `diagnose-power` now also shows the lid, button and battery actions, whether the charger is connected, and saves a Windows battery report in `logs\`.
- The alerts listener's log now records the text and tags of each alert.

## 19 Oct 2026: improvements from your list

| # | What | Detail |
|---|---|---|
| 209 | **My filter** | Home (All, Perso, Pro): replaces the "All" block. Words, due date, project, labels with / without, all combined (AND). Remembered on each device. |
| 247 | Inbox order | Newest first by default; a button switches to oldest first. |
| — | **New task** | One text box. The task goes to the Inbox, nothing in the text is read as a date or label. Same on the phone, the Mac and the PC. |
| — | New task icon (phone) | The app icon's "New task" shortcut has its own icon; drag it onto the home screen (Settings > This device explains how). |
| — | Weekly review, Tomorrow's priorities | Redesigned as figures plus numbered steps that fold away once clear. New content: Inbox to empty, overdue, next 7 days, waiting for, untouched for 60 days, finished this week; due by tomorrow evening, finished today, a note above 7 tasks. |
| — | Left panel | The three text links became three icons in the bottom corner: Tomorrow, Weekly, Bin (no count shown). |
| 281 | Validate from the task page | A "Validate definition" bar on Inbox tasks (or `v`). |
| 282 | Phone: long-press menu | Project, labels, due and start dates, open, Bin. |
| 280 | Phone: back gesture | Closes the open box, menu, dialog or side panel instead of leaving the page. |
| 251 | Task title | Grows over several lines on the task page. |
| 293 | Errors | The same error is shown once (then counted). Settings > Errors keeps the history, with **Copy for Claude**. |
| 128 | Keyboard | `/` search, `g h` `g i` `g t` `g w` `g b` `g s` to jump, `v` on a task page. |
| 215 | Settings > About | App changes reach every user; data stays per account. |
| — | Sessions | A sign-in now lasts 30 days instead of 3. The sign-in page shows the changes kept on the device. |
| — | Fixes found while testing | Inbox order could be wrong for tasks created within the same second. In review lists the action button no longer squeezes out the labels. |

## 19 Oct 2026: copies off the PC

Until now the nightly backups stayed on the PC's own disk: if the PC died, they went with it. Copies now go to the **Mac through Tailscale** (Taildrop, encrypted from end to end, no cloud). A first version sent them to OneDrive; on your request it was replaced the same day, and the OneDrive setting removed.

| What | Detail |
|---|---|
| Scheduled task "Tasks weekly safeguard" | Every hour, as you: once a day, a checked backup of the database is queued as `tasks-data-<date>.db`; every Sunday, the full rebuild kit `tasks-server-<date>.zip` (data, Vikunja, app, app source, tools, scripts, docs, settings), checked (readable, complete). Queued files are sent to the Mac when it is awake and leave the queue (`state\offsite-outbox`) once sent. They arrive in the Mac's Downloads. |
| Scripts | `install-weekly-safeguard` (once: finds the Mac, schedules the task, makes the first full copy) and `weekly-safeguard` (a full copy now). `export-for-new-pc` shares the same packing code. |
| Health check | New line **Off-PC copy**: warns after 3 days with nothing sent to the Mac, problem after 10 days or if a run failed. |
| Docs | MOVE-TO-NEW-PC: what is on the Mac and how to rebuild when the PC is dead. |
| Tested | On a copy of the server with a simulated Mac (PowerShell 7 on Linux): Mac asleep (files wait), Mac awake (sent, queue emptied), hourly runs not repeating the daily copy. The first OneDrive run on the PC worked (38 MB zip). |

## 19 Oct 2026: help menu and My filter

| What | Detail |
|---|---|
| Help and settings | One simple page: Status (with **Run a health check**), errors, keyboard (computer) or New task icon (phone), alerts, Maintenance folded away, Sign out. Removed: "Send all tasks to the Inbox view", the About and This device sections. |
| Run a health check | The app server (`tools\serve_app.py`) accepts `POST /run-health-check` from a signed-in device (token checked with the local Vikunja), at most once a minute, and starts `healthcheck.py`. Active after `deploy-app` (it restarts the app server). |
| My filter | Labels first, in a box where you type and press Enter to add one after another; **All of them / Any of them**; due date, project and words smaller, below. |
| Bin icon | No count. |

## 19 Oct 2026: Inbox, tasks leaving before validation (fixed again)

| What | Detail |
|---|---|
| Problem | Giving a project to a task in the Inbox view could make it leave the view at once, before you validated it. |
| Likely cause | On a device whose label list was not complete, the "to validate" flag was dropped from the task on that device (the server kept it). The exact path could not be reproduced on a copy of your data, so two safeguards were added. |
| Fix 1 | Changing a task's labels never drops a label this device does not know yet; the "to validate" label is reused from your tasks rather than created twice. |
| Fix 2 | A task moved out of the Inbox project stays in the Inbox view on that device until you validate it (kept for a day), and its flag is put back if it was lost. |
| Tests | New suite `e2e/inbox-keep.mjs` (9 checks, on a copy of your current data). |

## 19 Oct 2026 (evening): validation status rebuilt

| What | Detail |
|---|---|
| Why | Tasks left the Inbox without being validated (after a new project, a new title). "Validated" was the *absence* of a hidden "to validate" label, so anything that lost that label validated the task silently. And a label change sent the task's whole label list, so a device with an older copy could erase it. |
| New rule | A task is in the Inbox until you validate it. Validating adds a hidden `ctx:validated` label; nothing else adds it. A task without it is in the Inbox, so a lost mark brings a task back instead of hiding it. |
| Labels | Sent one change at a time (add one, remove one). An older copy can no longer erase other labels. |
| One-time marking | The first device that syncs with this version marks every open task validated the old way (54 on your data) and records it in your account; the others switch over. Tasks still to validate are untouched. |
| Unchanged | Complete from the Inbox once it has a project (it validates it). Validation needs a project. |
| Server health check | The "inbox" line counts tasks without the mark (`automations\healthcheck.py`). |
| Found while testing | A duplicated task (or any task created with labels) did not send its labels to the server. Fixed. |
| Tests | `e2e/status.mjs` on a copy of your current data (12 checks: marking, same Inbox before and after, rename and project change keep a task in the Inbox, validation, lost mark brings it back, second device). |

## 21 Oct 2026: review, error report, updates

| What | Detail |
|---|---|
| Review: validation | On the server the new rule works (54 tasks marked on 19 Oct at 22:26, none validated since without you). Tasks still left the Inbox on devices running an **older version of the app** (a phone or Mac app left open): they only know the old flag and hid tasks to validate that sat in a project (e.g. "Aller voir Sandy…"). |
| Fix 1 | Every device now updates itself to the latest version (see FEATURES, "Updates"). |
| Fix 2 | Until then, the old flag is kept right for older versions: tasks to validate outside the Inbox project carry it, validated ones don't. |
| Error report | Help > **Error report (30 days)**: server and all devices, one text for Claude. The app server (`tools\serve_app.py`) keeps the devices' errors 62 days (`state\client-log.jsonl`) and builds the server part (`GET /report`, signed-in devices only). |
| Off-PC copy | A Mac listed online but asleep ("not replying", 502) was counted as a failure (health check "Off-PC copy: fail" on 19 and 20 Oct). Now it just waits. Hourly runs that do nothing no longer leave a log file (there were 24 a day); logs older than 14 days are deleted. |
| To do on the PC | **Vikunja 2.7.1** is out with security fixes: run `scripts\update-vikunja.bat`. And at the last check (21 Oct 17:07) the laptop was **on battery**: plug the charger in. |
| Seen, nothing to do | 19 Oct: ntfy unreachable for 2 hours (internet name lookup on the PC), alerts resumed by themselves. The phone (Firefox) had no refresh cookie until 19 Oct morning, fixed by signing in again. |

## 21 Oct 2026: battery warning

The health check's "Power" line now warns only after the PC has been on battery for **4 hours in a row** (before: as soon as it was unplugged, as a failure). The start time is kept in `state\on-battery-since.txt` and cleared when the charger is back.

## 21 Oct 2026: off-PC copy alarm

The health check's "Off-PC copy" line now raises only one warning: **no copy has reached the Mac for 10 days**. A Mac asleep for a while, or a failed attempt, no longer counts (both are retried every hour).

## 21 Oct 2026: alerts made uniform

| What | Detail |
|---|---|
| One list | [ALERTS.md](ALERTS.md): every check, when it is a problem or a warning, what to do. TROUBLESHOOTING points to it. |
| Two levels, one meaning | Problem = act today (no sync, data at risk, security). Warning = when convenient. "App server: page looks wrong" became a problem (devices cannot load the app). |
| Same words | Phone: "Tasks problem: …" / "Tasks warning: …" / "Tasks: all OK again", for the PC's checks and the devices' alerts alike. App bar: "Server problem: …" (red) and now also "Server warning: …" (orange), "+N" when there are more. |
| Every fix is one instruction | Each one starts with what to do, names the script as `scripts\….bat`, and points to the Error report when Claude is needed. |
| New checks | **Device errors (24 h)** on the PC (sync failures, refused changes and crashes sent by your devices). **Connection to the PC** in the app (shown as a problem when this device cannot reach the PC). |

## 21 Oct 2026: update-vikunja fixed

Since Vikunja 2.7.1, each release also contains another program for Windows ("veans", a command-line tool). `update-vikunja` downloaded that one instead of Vikunja, so its test failed (nothing was changed: you stayed on 2.7.0). It now takes only the `vikunja-…-windows-4.0-amd64` build.

## 20 Nov 2026: the code on GitHub (#552)

| What | Detail |
|---|---|
| Repository | https://github.com/LouDodin/to_do_app (private), branch `main` |
| `app/` | The app's source, tests, user guide and admin guide |
| `server/` | This folder's scripts, automations, tools, Vikunja launcher, Mac helpers and docs |
| Left out | Database, backups, logs, `state/` (keys), requests, Vikunja programs. In `run-vikunja.cmd` the server secret reads `REPLACE_WITH_YOUR_SECRET`; the real one stays on the PC only. A `.gitignore` keeps these out of later commits. |

## 19 Nov 2026 (evening): the rest of your develop_to_do_app list

| Task | What changed |
|---|---|
| #558 Abandon several at once | The selection bar has **Abandon** (before Bin): every ticked open task is closed as abandoned and goes to the Bin, like Abandon on a task page. Ctrl/⌘+Z undoes it. Ends the selection. |
| #566 + on the home page | Each block (Today, This week, Red, Available) has a **+** next to its name (shown on hover on a computer, always on the phone): the New task window opens with that block's label already chosen (today, week, p1, next-action). Left in the Inbox, the task shows in the block once sorted (a message says so). |
| Phone selection bar | With Abandon, the nine words ran into each other; the bar now has two rows of five. |
| #572 Labels while editing a title | While a row's title is edited, its labels and their + stay in view: the edit box stops before them, and one click on + opens the labels (the title is kept). Before, the box covered them and a label could be added only after clicking elsewhere. |
| #567 Last errors | The only remaining warning ("Device errors (24 h)", Mac) and one phone line from 16 Nov ("Unauthorized" on the sign-in page) are both the signed-out sync fixed earlier today; they age out of the 24 h window by themselves. |
| Ticked in the app | #515, #516, #519, #520, #550, #551, #556, #557 (done, checked on the PC: all changed), then #558, #566, #567, #572. |
| Tests | New `e2e/nov19b.mjs` (11 checks). |

## 19 Nov 2026 (later): "Device errors (24 h)" on the Mac

The warning (19 × "Partially synced — Vikunja API URL is not configured", Mac Chrome, 18 Nov 19:43–21:12, on the sign-in page) was the end of the sign-out fixed above (#550): the Mac lost its session at 19:47 (the server log shows its renewals refused), the app went to the sign-in screen, and its 5-minute sync kept running with neither session nor server address, logging an error each time.

| What | Before | Now |
|---|---|---|
| Signed out with the app open | Sync and the send queue ran every 5 minutes and logged "not configured" | Nothing runs until you sign in again (`pull`, `runFlush`: `isConfigured()`); waiting changes stay on the device |
| Server address | Guessed next to the app (:8443 → the same server without the port) only while signed in, never written down | The guess is written down, so it survives a sign-out |
| Tests | | New `e2e/signed-out-quiet.mjs` (fails on the previous build, passes now) |

## 19 Nov 2026: your develop_to_do_app list

From the open tasks of the project develop_to_do_app (read from the 19 Nov 03:00 backup; nothing changed in your data). Already done before, to tick: #515 hide pending tasks, #516 + next to projects and sections, #519 the cart adds directly, #520 mark pending/archive on the phone.

| Task | What changed |
|---|---|
| #550 Stay connected always on a device | Cause found: the server's refresh cookie is single-use and replaced at each renewal; two renewals at the same moment (two windows, a device waking up) made one fail (500, or 401) and the app signed the device out. Now a failed renewal is tried again 0.9 s later with the new cookie. Server: sessions last a year after the last use (`VIKUNJA_SERVICE_JWTTTLLONG=31536000`, was 30 days); Vikunja restarted (no one signed out: the secret is unchanged). Test: sandbox Vikunja 2.8 (reuse of an old cookie: 401, concurrent: 500, new cookie still valid; 365-day cookie with the setting) |
| #556 In new task window, impossible to slide in labels | Only the first 8 labels were listed: now all of them. On phones the list fits above the keyboard (42 % of the screen at most), slides with a finger, and the search box is not focused on touch screens (no keyboard hiding the list) |
| #557 From the Inbox, move a task into its project directly; it is then validated | Drag a task onto a project in the menu (computer, any page): moved there (several selected tasks too). From the Inbox page it is validated at the same time, also with the row's project or the selection's Move. A message says so |
| #551 Reminders on the phone | Task page › **Remind**: a day and a time. Every minute the PC (`automations/reminders.py`, run by `run_poller.py`) sends "Tasks: reminder" to the owner's ntfy topic (Help › Alerts); generic text, a tap opens the task; "(late)" if the PC was off, dropped after 12 h; each sent once (`state/reminders-sent.json`). Vikunja clears reminders on a full update that leaves them out: kept by the app (`sync.ts`) and by the automations (`TASK_FIELDS`) |
| #552 Generate a GitHub with the project | Waiting for you: an empty private repository to create on github.com (see the reply) |
| #554 Bitwarden on phone | Steps for Chrome on Android in the reply (Chrome's "Autofill using another service") |
| Tests | New: `e2e/labels-slide.mjs` (5), `e2e/inbox-move.mjs` (5), `e2e/reminders.mjs` (5), `automations/test_reminders.py` (6), a unit test for the renewal retry (159 in all) |

## 15 Nov 2026 (later): a moon and a calendar to choose

| What | Before | Now |
|---|---|---|
| Tomorrow | ☆ / ★ in place of the circle | The moon (the menu's Tomorrow icon): outlined = not chosen, filled round = on tomorrow's list |
| Weekly review | ☆ / ★ for the week's list in place of the circle, and a Tomorrow button (a moon on phones) on the right, vertically centred | Both in place of the circle, aligned with the title: the calendar (the menu's Weekly review icon) for the week's list, then the moon for tomorrow's. Side by side on a computer, one above the other on a phone |
| Code | `.star` | `.choose` buttons in the row's lead (`TaskRow.svelte`; `.pick` is already the selection square) |
| Tests | | reviews (35: no stars left, moon and calendar side by side and aligned), phone-layout (one above the other, at the top), nov14 (40 px touch area), oct19 |

## 15 Nov 2026: phone display

Every page and window checked at 360 and 390 px wide (nothing past the screen's edge, nothing overlapping, nothing cut).

| What | Before | Now |
|---|---|---|
| Top bar | On narrow phones the green sync dot sat on the search box | The dot has its own small place; the search box shows only the magnifier when it is under 96 px wide (container query) |
| Task page | Day, time and × wrapped over three lines; the time was cut ("09:00 A") | Day and time side by side at their natural width, the picker icons hidden on phones (a tap opens the phone's picker), label column 64 px; the action buttons wrap neatly; 🔗 replaced by a grey link icon |
| New task window | The Labels list ran past the right edge | On phones the Start, Due and Labels lists open across the whole window |
| Weekly review | "Tomorrow" pills pushed the task text and ran to the card's edge; the line under a row stopped before its buttons | A moon (36 px) on phones; the line runs under the buttons (`TaskList`, phones) |
| Upcoming | Small tick, plan and + buttons | 40 px touch areas on touch screens |
| Emoji | ☑ in the task menu, ⛓ in the links column | Grey line icons |
| Help | "the view (Inbox, All, Pro or Perso)", "Every place: Home…", a missing space | All Pro Perso; Inbox first; fixed |
| Tests | | New `e2e/phone-layout.mjs` (16 checks); layout: 6 Updates entries after 6 Nov |

## 14 Nov 2026 (afternoon, later): the Inbox line like the others

| What | Before | Now |
|---|---|---|
| Inbox line (Tomorrow step 1, Weekly review Clean up) | No grey on hover; only the box ticked it | Greys on hover like Desktop, Downloads, Emails; a click anywhere on the line ticks or unticks it, except on Open (which goes to the Inbox) |
| Tests | | `e2e/reviews.mjs` 32 checks |

## 14 Nov 2026 (afternoon): the Inbox box, also by hand

| What | Before | Now |
|---|---|---|
| Inbox box (Tomorrow step 1, Weekly review Clean up) | Ticked by itself only | Still ticked by itself when the Inbox is empty, and can be ticked or unticked by hand; a hand tick wins until the app is reloaded (kept in memory: `stores/inboxTick.svelte.ts`, one per page). On Tomorrow, the step's number does the same |
| Tests | | `e2e/reviews.mjs` 30 checks (hand tick, kept after going to the Inbox and back, forgotten on reload); oct19: 4 boxes in Clean up |

## 14 Nov 2026 (noon): the Inbox box ticks itself

| What | Before | Now |
|---|---|---|
| Inbox row (Tomorrow, step 1; Weekly review, Clean up) | The whole row was a link to the Inbox, so its box could not be ticked | The box is a status only: ticked by itself when the Inbox is empty ("Empty" next to it). An **Open ›** button at the end goes to the Inbox |
| Tests | | `e2e/reviews.mjs` 28 checks (a click on the box stays on the page) |

## 14 Nov 2026 (later still): Clean the Inbox, first step of Tomorrow

| What | Before | Now |
|---|---|---|
| Tomorrow | Your list for tomorrow, To consider | Step 1 **Clean the Inbox** (a link to the Inbox page with the first titles waiting there; ticked by itself once the Inbox is empty), then Your list for tomorrow, To consider |
| Tests | | `e2e/reviews.mjs` 26 checks |

## 14 Nov 2026 (later): the labels the automations use, first in the menu

| What | Before | Now |
|---|---|---|
| Labels in the menu | One block, sorted by colour then name | First line: the labels the app and the automations act on, in a fixed order (`today`, `week`, `next-action`, `p1`, `overdue`, `last-day`, `waiting-for`, `shopping`; list in `src/lib/utils/systemLabels.ts`), then a thin line, then the others as before. The label search covers both lines |
| Docs | | User guide (labels), admin guide (section 9, the list and who creates which), Updates entry `2026-11-14b` |
| Tests | | New `e2e/system-labels.mjs` (5) and a unit test (158 in all); layout: 5 Updates entries after 6 Nov |

## 14 Nov 2026: Tomorrow, the Weekly review and Upcoming simpler; All Pro Perso; a grey cart

| What | Before | Now |
|---|---|---|
| Home page | Show completed under each block | None (`completed="hide"` on the five lists) |
| Top bar | A "View" dropdown (All ▾) | All, Pro and Perso written side by side, a click switches (`ViewSwitcher.svelte`, radio buttons) |
| Cart | The 🛒 emoji (the only thing in colour) in the menu, the New task box, a task's page and the Shopping title | The grey line icon (`Icon name="cart"`), like the house; in the New task box it fills like Add once ticked |
| Upcoming | 7 days, then blocks per week (three weeks) and per month | Every day, for 61 days at least and up to the last planned task (366 at most), with the month's name between months |
| Tomorrow | Called "Tomorrow's priorities"; "Planned for today, not done" was a step of its own | Called **Tomorrow** (page, tab, app shortcut, guide). Two steps: Your list for tomorrow, To consider; "Planned for today, not done" is the first group of To consider |
| Weekly review | "Planned this week, not done" was step 3 | Three steps; it is the first group of Plan the coming week, after Your list for the week |
| Stars on the phone | 22 px | 44 px touch area, 24 px star (`@media (hover: none), (max-width: 640px)`) |
| Tests | | New `e2e/nov14.mjs` (13 checks); reviews (25), nov13 (Upcoming days), oct19, inbox-page, week-sections updated |

## 13 Nov 2026 (last): Tomorrow's priorities and the Weekly review redone

You asked for as few sections as possible, only what is ahead (no figures, no past work), the tasks planned and not done, and the Weekly review to be enough on Sundays.

| What | Before | Now |
|---|---|---|
| Tomorrow's priorities | Three figures, then Your list, Due by tomorrow evening, This week, Other candidates, and Today's summary (planned/done) | **Planned for today, not done** (only if any; ★ keeps it for tomorrow), **Your list for tomorrow**, **To consider** (Due by tomorrow, This week, Next actions, Due in the next two weeks, Due later, Recently added). No figures, no summary |
| Weekly review | Four figures, ten steps, Finished this week | **Clean up** (Desktop, Downloads, Emails, Inbox), **Projects and tasks on hold** (no next action, pending projects, pending tasks, waiting for, untouched 60 days), **Planned this week, not done**, **Plan the coming week**. On each task of the last two: ☆ week's list and **Tomorrow** (the `today` label) |
| Day plans (`tasks_day_plans`) | A task labelled `today` counted as planned for the day it was seen | A task chosen in the evening (Tomorrow's priorities, the Weekly review's Tomorrow) is written under tomorrow's date, so it is not "planned for today, not done" |
| Hand ticks | `step-1` … `step-10` | `step-clean`, `step-review` (older ticks simply no longer show) |
| Tests | | New `e2e/reviews.mjs` (22 checks, computer and phone); oct19, nov13, week-sections, nov5 updated; unit tests 157. Note: on the test server, deleting a project left its tasks behind for some runs, which made Upcoming checks fail until the test data was reset |

## 13 Nov 2026 (late night): This week on the home page and in Tomorrow

| What | Before | Now |
|---|---|---|
| Home page | Today, Red, Available | Today, **This week** (tasks labelled `week`, not already in Today), Red, Available. A `week` task that is also `p1` or overdue is in This week, not Red (`partitionHomeBlocks`) |
| Tomorrow's priorities | The week's list was a folded group inside Candidates | Step 3 **This week** (open, ☆ to choose), then step 4 **Other candidates** (Next actions, Due soon, Due later, Recently added) |
| Tests | | New `e2e/week-sections.mjs` (7 checks); a unit test in `home.test.ts` (156 in all) |

## 13 Nov 2026 (night): the Inbox is a page

| What | Before | Now |
|---|---|---|
| Inbox | A view of the home page, chosen in the top bar's view menu (Inbox / All / Pro / Perso) | A page of its own, `/inbox`, first in the menu (`g i`). Same list: newest first (switchable), a task stays until validated, completed or binned |
| Menu | Home, Shopping, Upcoming, Tomorrow, Weekly review, Bin | Inbox, Shopping, Upcoming, Tomorrow, Weekly review, Bin. Home is the house in the top bar (`g h`) |
| View menu | Inbox, All, Pro, Perso | All, Pro, Perso. A device that had Inbox saved as its view opens on All; old links `/?view=inbox` open the Inbox page |
| Tests | | New `e2e/inbox-page.mjs` (17 checks, computer and phone); layout, oct19, smoke, sticky, status, error-report and oct22 point at `/inbox` |

## 13 Nov 2026 (evening): abandoned → Bin, Upcoming redone, labels in the new task window, sign-in for Bitwarden

| What | Before | Now |
|---|---|---|
| Abandon | Closed with the hidden label `ctx:abandoned`, left among the completed tasks of its project | Also moved to the Bin (marked "Abandoned" there, 30 days); Restore reopens it and removes the mark. Tasks abandoned before are moved there at the next sync (`binAbandoned`) |
| Bug: moving a task to the Bin | The server update of a task already moved to the Bin on the device was sent without its other values, which Vikunja clears: done, dates were lost on the server | `sync.ts`: an update takes the task's current values from the Bin too |
| Upcoming | Two months of days | Redone: a 7-day strip, Overdue, To schedule, the next 7 days, then weekly then monthly blocks with only what is there; own compact rows (circle, title, due flag, project, calendar button) |
| New task window | Labels shown as a number | Each label by its name in the row, with × |
| 🛒 New task box | Black background | Outlined like Add, filled once ticked |
| Sign-in | Server box first (Bitwarden on the phone could take it for the username), no field names | Server hidden when known ("Change server"), boxes `id`/`name` username and password with `autocomplete` username / current-password; server box marked ignored by password managers. Test `e2e/login-fill.mjs` |

## 13 Nov 2026 (later): no counts, handles on hover, new task window menus, overdue on Upcoming

| What | Before | Now |
|---|---|---|
| Sections, all accounts | — | Checked on the server: LouDodin PHD 12 sections (55 tasks placed); LouCanava 4 projects, 14 sections, as before |
| Counts | Project page: open count, section counts, sub-project counts, Completed/Pending numbers; menu: Shopping count | None |
| Section handle ⠿ | Faint, always | Hidden until the pointer is over the section (like the tick boxes); faint on touch screens |
| New task window | A click outside closed the window even with a menu open | First click closes the menu (dates, labels), the next closes the window without adding; key tips line as in the New task box (hidden on touch screens) |
| 🛒 (New task box) | Grey | On a black background |
| Upcoming | Only tasks due from today | Also the overdue ones, at the top. (Tasks starting later and due in range were already under both days; Lou had no task starting in the future, only due dates, hence the impression that only due dates were shown) |

## 13 Nov 2026 (afternoon): sections restored, new task window, Upcoming over two months

Asked by Lou after the morning's update.

| What | Before | Now |
|---|---|---|
| Sections of PHD wiped | At 08:46, just after the PC restarted, a device that had not received the 12 sections of project 2 (PHD) yet sent "no sections" for it: they disappeared on every device | `sectionSync.ts`: a device never writes a project's sections over a newer version it has not received (it takes it first). The 12 sections, from the 08:44 backup, are offered by `serve_app.py` (`/sections-restore`, file `state\sections-restore\LouDodin.json`, to that account only) and written back by the app once (`applySectionRestore`). Test `e2e/sections-safe.mjs` |
| New task window | Broken on the Mac (the fields overflowed the box) | Rebuilt: title, notes, one row of buttons (project, section, start, due, labels), Add; no headings or Cancel. Also opened by + next to a day on Upcoming (with that day as start; the project chosen there is remembered) |
| Project page (computer) | Options under ⋯ | In view next to +: order, Completed, Pending, Mark pending, Archive; ⋯ on the phone only. Sub-projects: open ones only (no pending) |
| Menu | Home, Shopping, Tomorrow's priorities, Upcoming, Weekly review; Bin at the bottom | Home, Shopping, Upcoming, Tomorrow, Weekly review, Bin |
| Weekly review | "Desktop folder", "Downloads folder" | "Desktop", "Downloads" |
| Reviews' lists | Completion circle + "Pick" / "Remove" buttons | ☆ in place of the circle picks, ★ takes off (TaskList/TaskRow prop `lead`) |
| 🛒 in New task | Ticked a mode; Add still needed | With a title typed, adds it to the Shopping list at once |
| Upcoming | 7 days, then "Later" (30 days) | Every day for two months at least, up to the last planned or due task (a year at most); empty days are thin lines, months marked; + on each day; plan menu: 14 days + Another day…; "Week's list · no day yet" at the top; Inbox tasks shown once a day was chosen for them |
| Guides | — | User guide sections 3, 7, 8, 10, 11 |

## 13 Nov 2026: project page, Upcoming, the week's list, wider candidates, Black theme

Asked by Lou (with the suggestions of the project develop_to_do_app: tasks 515, 516, 519, 520) and Lou Canava.

| What | Before | Now |
|---|---|---|
| Project page | Order button, Mark pending and Archive buttons, an "Add a task…" line under every block, column names and "Show completed" above every section: a lot of space; the buttons were pushed off a phone's screen (task 520) | Name, then **+** (a new task in a window: title, notes, section, dates, labels: task 516) and **⋯** (order, Show completed, Show pending tasks, Mark pending, Archive/Restore). Sections: dragged by their title bar (mouse) or handle ⠿ (finger), folded with ›, + and ⋯ (Move up/down, Delete). No column names, no project column. `NewTaskDialog.svelte`; `TaskList` props `completed` and `columnHeads` |
| Pending tasks (task 515) | Hidden from the home page and the Tomorrow candidates only | Hidden everywhere (home, Tomorrow, Weekly except its own step, Upcoming, filters, labels' pages) whatever their labels; on their project page only with ⋯ › Show pending tasks |
| Shopping label (task 519) | Only 🛒 took a task out of the Inbox | Giving the `shopping` label to a task of the Inbox does what 🛒 does |
| Tomorrow's candidates | The saved filter "Tomorrow": a due date or next-action, started by tomorrow | `candidates()` in `utils/reviews.ts`: This week (label `week`), Next actions (next-action, p1, Single tasks), Due soon (14 days), Due later, Recently added (14 days); never the Inbox, pending, shopping, waiting-for, not started by then, or the projects the saved filters leave out. Long groups folded |
| The week's list | — | Weekly review step 10 "Plan the week": Pick gives the label `week` (it existed, with its saved filter "Week") |
| Upcoming | — | New page `/upcoming` (menu, g c, home-screen shortcut): 7 days, planned (start date that day) and due tasks; Plan… menu or drag onto a day sets the start date; "This week, not planned yet" at the top; Later (30 days). `utils/upcoming.ts` |
| Appearance | Light only | Settings › Appearance (per device): Light, Black (pure black, dot-matrix titles, font Doto, OFL, in `static/fonts`), Like the device; shades of grey. Black also switches the manifest to `manifest-black.webmanifest` (black icons) for the next "Add to home screen" |
| Account settings | Five places each read then wrote the whole settings: a day-plan save could wipe the sections | `api/userSettings.ts` serialises the saves; sections not yet sent are kept on the device and sent on leaving the page |
| Tests | — | `e2e/project-page.mjs` (27), `e2e/nov13.mjs` (23), unit tests for candidates and Upcoming; layout, oct19, nov10, select updated |
| Guides | — | User guide sections 7, 8, 10, 15, 17; admin guide, "Where a new feature goes" |

## 12 Nov 2026: what runs on the PC

Asked by Lou (the fan was loud): check that nothing useless opens or stays open for the to-do or its upkeep, while letting the PC work normally (updates and so on). At the time, the Claude desktop app was the main load (13 % of the processor, 1 GB); Vikunja 0 %.

| What | Now |
|---|---|
| Health check | Three new checks, hourly, for the admin only: **PC: the server's programs** (its own scripts stuck far too long, or a listener twice: stopped by itself, logged in `state\pc-load-stopped.log`), **PC: busy programs** (busy for 3 hours in a row), **PC: start-up programs** (started with Windows and not needed). Windows, its updates, the antivirus, search, drivers, Tailscale, OneDrive and Claude are never touched nor reported |
| Files | New `tools\pc-load.ps1`; `tools\healthcheck.py`. Stopping is on once `state\pc-load-stop.txt` exists (first run read-only, checked by Claude). **Switched on 13 Nov 2026** at Lou's request, after a read-only run on the PC (which caught the two automation listeners, one per account, wrongly counted as stuck: fixed before switching on) |
| Guides | Admin guide section 5; `ALERTS.md` |

## 11 Nov 2026 (evening): several labels at once

Asked by Lou Canava: tap several labels and see the tasks that have them, live.

| What | Before | Now |
|---|---|---|
| Labels | A click on a label in the menu opened that label's page | On a label's page, a click on another label in the menu **adds it** (marked in the menu), a click on a marked one **takes it off**; the list follows at once. The page shows the labels as chips: **×** takes one off, **+** adds one (the way on the phone, where the menu closes after a tap); with two or more, **All of them** (default) or **Any of them**. Address: `/label/12+15` (`?any=1`); from any other page a label opens alone |
| Tests | — | New `e2e/labels-multi.mjs` (10 checks, computer and phone); 3 unit tests |
| Guides | — | User guide section 9 |

## 11 Nov 2026 (afternoon): white selection bar, Updates merged, dates, weekly review, abandon, less text

| What | Before | Now |
|---|---|---|
| Selection bar | Dark, with a "More" menu; Labels, Due, Pending and Shopping kept the selection | **White** (soft shadow): Complete · Move · Labels · Due · **Pending · Shopping · Inbox** directly · Bin. **Every action ends the selection** |
| ? → Updates | One entry per update, so a reworked feature appeared several times | **One feature, one place**: when a feature is reworked, its lines leave the older updates and the newest describes it as it is now; one update per day. Applied now: several tasks at once (6 Nov → 11 Nov), the Help centre and What's new (19 Oct, 25 Oct, 10 Nov → 10 Nov), Got it (22 Oct → 30 Oct), automatic updates (21, 22 Oct → 25 Oct), today's entries merged into one. Rule written in `src/lib/news.ts` and the admin guide |
| Dates | One "date and time" box: picking a day without a time saved nothing, and closing the window lost it | A **day** box and an optional **time** box (`DateField`): the day alone is saved at once (09:00 for a start, end of day for a deadline), and whatever was chosen is kept when the box loses the focus or the window closes. Row windows, the phone's long-press menu and the task page; × on the task page removes a date |
| Weekly review | Step 7 "Pending projects and tasks" | Step 7 **Pending projects**, step 8 **Pending tasks** (with Resume), step 9 Untouched |
| Weekly review | Steps closed only when empty; Tidy your computer: Desktop, Downloads | Click a step's **number** to tick it for the week even with things left in it (in your account, all devices; Tomorrow's priorities unchanged). Tidy your computer: **Desktop, Downloads, Emails** |
| Abandon a task | — | **Abandon** (task page, next to Delete; the phone's long-press menu; Weekly review › Untouched): the task is closed (done) with the hidden label `ctx:abandoned`; it leaves the lists, shows ✕ and "abandoned" among completed tasks, is never counted as done (weekly figures, Tomorrow's priorities, Today's summary: "abandoned"), and a repeating task stops repeating. **Reopen** (on its page, or its circle) removes the mark. Undoable |
| Less text | Explanations under titles and in Settings, Shopping, Bin, the error page, the New task box, project dialogs, the selection bar | Removed or cut to a few words (the user guide keeps the explanations); review steps lose their sub-titles |
| Selection | Labels, Due, Pending and Shopping kept the selection | **Every action ends the selection** |
| Tests | — | New `e2e/dates.mjs` (7 checks), `e2e/abandon.mjs` (9 checks); `select`, `layout`, `oct19` (weekly ticks, Emails) updated; 146 unit tests |

## 11 Nov 2026 (later): selecting several tasks, rethought

You found it hard to select (a click on a task changed one of its properties), hard to unselect, and the options not pretty.

| What | Before | Now |
|---|---|---|
| Selecting | Ctrl/⌘-click or Shift-click on a task; a plain click on the project, a date or a label of a row opened its editor | A **tick box** on the left of every task (shown when pointing at it; always once something is ticked). While tasks are ticked, **a click anywhere on a task only ticks or unticks it**: no editor opens, nothing changes by mistake. Shift+click: a range. **Select all N** on the bar, or Ctrl/⌘+A. Ctrl/⌘-click still works |
| Phone | Not possible | Long-press a task → **Select several tasks**, then tap the others (a tap no longer opens a task while selecting); the round + hides behind the bar |
| Unselecting | Esc, or a small × | **×** at the left of the bar, **Esc**, a **click on an empty part of the page**, or a second click on a ticked task. Closing a menu or window no longer loses the selection |
| The bar | White, text buttons "Move to project…", "Section…", Complete, Bin (with a confirmation window) | A **white bar** (soft shadow, rounded) with icons: **Complete · Move · Labels · Due | Pending · Shopping · Inbox | Bin** (Pending, Shopping and Inbox directly, in one click; first shown dark with a More menu, changed the same day at your request). Move: project search, plus the sections of the project shown. **Labels**: ✓ all have it, – some do; a click adds it to all or takes it off all. **Due**: today, tomorrow, in a week, a date, none. **Pending** becomes **Resume** when all are on hold; **Shopping** puts them on or off the list. Every action ends the selection. Bin: no confirmation, Ctrl/⌘+Z brings them back. On the phone it spans the bottom, icons above short words |
| Tests | — | New `e2e/select.mjs` (31 checks, computer and phone); `nov5` updated |
| Guides | — | User guide section 7 (with a picture), shortcuts |

## 11 Nov 2026: task page, archived projects, battery alert

| What | Before | Now |
|---|---|---|
| Task page ("a lot of text and info everywhere") | A column of large fields, each with a heading and sentences of explanation (Shopping, Pending, Markdown, Repeat); the project path under the title and the project again below; Relations always open | The title; two switches **🛒 Shopping** and **Pending** (explanations in their tooltips); one line per detail, name on the left (Project "in HOME" + ↩ Inbox, Section, Labels, Start, Due, Repeat); **Notes** (Markdown reminder on hover); **🔗 Link a task** opens only when needed; Duplicate / Delete at the bottom. Same on the phone |
| Archived projects (menu > Show archived) | A flat list under the tree | In their place under their parent, greyed out and tagged "archived", like pending ones; an active project under an archived one appears under it too |
| Battery alert | After 1 h on battery, read from the battery's own status: five false alarms on the night of 10–11 Nov (plugged in and full, the battery says "discharging") | After **1 h 30**, and only if Windows says the charger is unplugged (power line flag) **and** the charge has gone down by 3 points or more; at 20 % or less, at once. Each alert is logged with "sent" or "NOT sent" (`scripts\auto-update.ps1`, `tools\healthcheck.py`: in use since 08:38) |
| Phone notifications | — | They need the ntfy app subscribed to the PC's topic, allowed to run in the background (admin guide section 5) |
| Tests | — | New `e2e/archived-tree.mjs` (7 checks); the suites updated for the task page; the battery watch tested with a simulated battery (false alarm case included) |
| Guides | — | User guide section 8 (new picture); Admin guide section 5 (Power, and "Getting the alerts on your phone") |

## 10 Nov 2026 (evening): one clear layout; the Help centre and its searchable Updates

You asked to unify where things are, and for a tab listing every update, with a search.

| What | Before | Now |
|---|---|---|
| The rule | Features added one by one, wherever there was room | **Top bar** = what works everywhere; **menu ☰** = every place to go; **a page** = its own title, buttons and tasks; **?** = everything about the app itself |
| Top bar | ☰ left panel, view, Home, ← →, undo/redo on the left; sync, +, ?, ☰ right panel on the right | Left: ☰ menu, Home, view (now with ▾ and a "View" heading), ← →. Right: sync dot (opens Status), undo/redo, + New task, **?** with a dot (blue: updates not seen; orange/red: something in Status). The right ☰ is gone |
| Menu | Left panel: Projects, "Show pending/Show archived" buttons, 4 unlabelled icons at the bottom (🛒, moon, calendar, Bin). Right panel: Filters, Labels | One menu: **Home, Shopping (count), Tomorrow's priorities, Weekly review** with names; **Projects** (Show: pending · archived), **Filters**, **Labels**, each heading folds (remembered per device); **Bin** at the bottom. Same on the phone |
| Help | "Help and settings": one long window of 10 sections; a separate Settings page with the same content | **Help centre**, 4 tabs: **Help** (install, how the app is organised, the user guide, shortcuts), **Updates**, **Status** (server, sync, warnings, Got it, health check, error report), **Settings** (alerts, automations, my data, label colours, maintenance, account). `/settings` shows the same tabs as a page (`?tab=updates`…) |
| Updates | "What's new" with the last 2 updates | **Every update since 10 Oct** (12), newest first, "New" on those not seen; a search box keeps the changes that mention every word typed (capitals and accents ignored), highlighted, with a count. The What's new box has **All updates** |
| User guide in the app | Only as PDF on your Mac | ? → Help → **Open the user guide**, on every device (`/guide/guide.html`, not stored offline) |
| Duplicates removed | 🛒 link on the phone's home page; What's new section in Help; Settings page | In the menu; the Updates tab; the Help centre |
| Shortcuts | g s → Settings page | **g p** Shopping, **g u** Updates, **g s** Settings tab |
| PC | — | `tools\serve_app.py`: `/guide/` always checked for a newer copy (takes effect when the app is deployed, which restarts the app server) |
| Tests | — | 144 unit tests (search and highlight of the updates); new `e2e/layout.mjs` (38 checks, computer and phone); the suites updated for the new layout |
| Guides | — | User guide sections 3, 7, 9, 10, 11, 12, 14, 15, 16, 17, 18 and new pictures; Admin guide sections 4, 5, 9, 14 (and "Where a new feature goes") |

## 10 Nov 2026: your Inbox ideas, a user's four requests, and the battery

| Task | What changed |
|---|---|
| Sections not visible on the phone (user request) | Sections were kept on each device only, so the phone (or any other device) had none. They are now kept **in your account** with the tasks in them and "My order": made on one device, they appear on the others within seconds of a sync, the phone included. Existing sections of each device are sent the first time it opens the new version (Vikunja user setting `tasks_sections`). |
| See the sub-projects and their tasks in a parent project (user request) | A project's page ends with **Sub-projects (n) and their tasks**: every project inside it, at every level (indented), each with its tasks; a name opens that project; foldable (remembered on each device). |
| Put a task in Pending (user request) | **Pending** on a task's page: the task stays in its project, greyed at the end, and leaves the home page and Tomorrow's priorities; the Weekly review lists it under "Pending projects and tasks", with **Resume**. Same on every device (hidden label `ctx:pending`); undoable. |
| Markdown in descriptions (user request) | A task's description is shown formatted: bold, italic, lists, titles, links (opened in a new tab), code. Click the text to edit it. Descriptions made in Vikunja's own editor (HTML) show as before. Nothing in a description can run as a script. |
| "Develop app update that tells users the news" (Inbox) | After each update, a small **What's new** box at the bottom left says what changed (once per device; **Got it**). Help → **What's new** lists every update. Written with each update (`src/lib/news.ts`). |
| "For errors and warnings, indicate who can see them" (Inbox) | Each warning in Help → Status says **Seen by:** everyone; you and <account>; only you; only this device; nobody any more (hidden for everyone). |
| "Solve problem pc" and "battery: notify as soon as not charged for an hour, a real phone notification" (Inbox) | What happened: unplugged around 20:00 on 9 Nov; the hourly check warned at 00:07 (the limit was 4 h); the battery ran out at 05:07 and the PC was off until 17:34 (12 h). Now `scripts\auto-update.ps1` watches the battery **every minute**: after **1 hour** on battery, or at **20 %** or less, an **urgent** phone notification (ntfy priority 5: rings even in Do not disturb on Android; generic text), once per stage, and a health check at once: **Power** turns **red** (problem) in the app. Back on the charger: "all OK again". |
| PC tools | `scripts\auto-update.ps1` (power watch), `tools\healthcheck.py` (Power: 1 h or 20 % → problem; priority 5; no double notification). Take effect within a minute; nothing to restart. |
| Tests | 139 unit tests; new `e2e/nov10.mjs` (29 checks); the power watch tested with a simulated battery; all suites. |
| Guides | User guide sections 7, 8, 10, 14 and 15; Admin guide sections 4, 5 and 14. |

## 6 Nov 2026 (later): the three warnings of the morning

| Warning | Cause | Fix |
|---|---|---|
| Vikunja version (red): 2.8.0 available with security fixes | — | Updated to 2.8.0 with `update-vikunja` (tested on a copy of the data first; it goes back by itself if anything fails). Nothing in 2.8.0 changes what the app uses; new: an account locks after 10 wrong passwords, and changing a password or e-mail asks for the current password. |
| Device errors (24 h), your Mac: "Partially synced: offline; Failed to fetch; offline" | The Mac went to sleep while an answer was arriving: reading it failed with "Failed to fetch", which was not recognised as "offline". | The app treats it as offline (not a fault); the health check ignores such lines, old ones included. |
| Server errors (last hour): "database is locked" | Vikunja's database was busy for a moment while Claude filed your tasks (one of them failed, then went through). | `task_ops.py` waits and tries again (up to 5 times). |

## 6 Nov 2026: your app tasks of 5 Nov, done

From the tasks in your Inbox and in develop_to_do_app about the app:

| Task | What changed |
|---|---|
| Capital letter at the start | Task titles start with a capital letter (not when they start with a web address, an e-mail, or a word like "iPhone"). |
| Bitwarden offers itself when adding a task | Every text box of the app is marked "not a sign-in field" for password managers (Bitwarden, 1Password, LastPass); the sign-in page is left alone. |
| Archive under "Mark pending" | A project's page has **Archive** (or **Restore** when archived) next to Mark pending; refused while tasks are open, checked on the server. |
| Moving a sub-project to the first place | Dropping a project just under an open project with sub-projects makes it its first sub-project (it went after the whole parent). |
| Several tasks with Shift / Ctrl | Ctrl/⌘-click or Shift-click selects several tasks; a bar moves them to a project or a section, completes them or puts them in the Bin; they can be dragged together. Esc clears. |
| Sections: move without dragging, add into one, reorder | "Section" on a task's page; each section has "Add a task to this section…"; ↑ ↓ to reorder sections. Several tasks: the bar's "Section…". |
| Drag a task in its project | Drag a task onto another: it goes just before or after it ("My order", kept on each device). |
| Order by creation date | Button above a project's list: Oldest first / Newest first / My order (remembered on each device). |
| Undo / redo | Ctrl/⌘+Z and Ctrl/⌘+Shift+Z (or Ctrl+Y), and ↶ ↷ in the top bar: complete, move, labels, rename, dates, Bin, sections, order, new tasks; a change to several tasks is one step. Last 50 changes, until the app is closed. |
| Daily summary (planned and done) | Tomorrow's priorities ends with **Today's summary**: the tasks planned for today (on the "today" list at some point today), each done or not, and what was done without being planned. The plan is kept in your account (all devices) for 14 days. |
| Menus opening upwards | A menu with no room below opens upwards; when it fits on neither side it takes the larger one and scrolls inside. |
| Shopping option | 🛒 in the New task box and on a task's page: a shopping item gets the "shopping" label, **skips the Inbox** (goes to a "Shopping" project unless it has a project) and is listed on the **Shopping** page (🛒 in the left panel; on the phone, under the filter box), grouped by shop label; tap to tick off. Kept out of the home blocks, the "not touched for 60 days" list, and (with the "Single tasks" projects) "Projects without a next-action". |
| Validate from a task's details | Already there (the Validate bar). |
| Widget on the phone; sync without the PC | Not done, as decided. |
| Server | New request `task-ops` (Claude from the Mac): validate / move / complete your own tasks, never delete (`tools\task_ops.py`). Used to file and complete these tasks in develop_to_do_app. |
| Tests | 131 unit tests; new `e2e/nov5.mjs` (25 checks); all suites. |
| Guides | User guide sections 4, 7, 8, 9, 10 and 17; Admin guide sections 2 and 10. |

## 5 Nov 2026: the error report of 4 Nov: a lost task, and three causes fixed

**One task was lost on 4 Nov:** "check cyto on Monday" (project resistance_chlorophyll_a, start date 25 Sep, no due date, no notes). Its project was archived and then deleted; Vikunja refuses to move a task out of an archived project, and leaves archived projects' tasks out of its task list, so the task was deleted with its project. It is in the backups of 4 Nov (before 11:20). No other task that existed at 02:00 on 4 Nov was lost (checked task by task between the backups of 4 Nov 02:00 and 5 Nov 02:00).

| What | Detail |
|---|---|
| Deleting an archived project | Its archived projects are first taken out of the archive; every task the server has in them is fetched (not only those on the device); each one is moved out (open → Inbox, done → Bin) and checked **one by one on the server** before any project is deleted. If anything did not move, nothing is deleted. Test: `e2e/archived-delete.mjs` (the previous version fails it: the three tasks were deleted). |
| Archiving | Also asks the server whether the project still has open tasks (the device may not have them yet); needs the internet. |
| "Already the case" is not a failure | A delete of something already gone, a relation or label already there or already removed: no longer reported as "A change could not be synced" nor counted in Device errors (the "relation already exists" and "project does not exist" of 4 Nov). |
| Two windows of the app on one device | The installed app and the Ctrl+Alt+T window on the PC renewed their sign-in at the same moment every 8 minutes: one got "database is locked" (500) or "Invalid refresh token", then synced with "Unauthorized" (the errors of 29–30 Oct). They now take turns, and a window that waited uses the new sign-in of the other. |
| Tests | 124 unit tests; all end-to-end suites. |
| Guides | User guide section 7. |

## 30 Oct 2026: you see everyone's warnings; "Got it" just for you or for everyone

| What | Detail |
|---|---|
| Everyone's warnings, for you | As the admin (the main account) you see, in Help > Status and in the bar, every warning of every account, before they tell you. Each says **Concerns:** (everyone / you / the account) and **Cause:** (which device of whom, e.g. "Alex · phone (Firefox, …)"). |
| Per account | Device errors, App versions, and the automations' lines are now one line per account ("Device errors (24 h) · Alex"). Each device's reports now say whose device it is. |
| The others | See the server's warnings and their own only. Before, every user saw everything, including your automation data checks (they could mention your task titles): fixed. Their Error report now has their own devices only. |
| "Got it" | You: **Got it (just me)** or **Got it (everyone)**. The others: "Got it" hides it for them only (before, anyone could hide a warning for everyone: fixed). Your own "Got it" also silences your phone alerts and PC notifications for that warning. |
| How | `tools/acks.py` (new, shared), `tools/serve_app.py` (/health.json per person, /ack-warning with a scope, account in /client-log), `tools/healthcheck.py` (per-account lines), `tools/notify.ps1`. |
| Tests | New `e2e/admin-warnings.mjs` (23 checks: two accounts, views, both scopes, the hourly check keeping and forgetting acknowledgements); `e2e/oct22.mjs` and `e2e/accounts.mjs` updated. |
| Guides | User guide section 15; Admin guide section 5. |

## 29 Oct 2026: "Install the app" on phones too

Lou Canava could not find how to install the app on her phone: the Install button in Help only appeared in browsers that can open their own install window (Chrome, Edge, Brave), so never in Firefox, Samsung Internet or on an iPhone.

| What | Detail |
|---|---|
| Help → Install the app | Now the **first section of Help** on every device where the app is not installed yet (it disappears once installed). In Chrome, Edge and Brave the button opens the install window as before; anywhere else it shows the **steps for the browser in use**, with where its menu is: Firefox, Samsung Internet, Opera, Edge and Chrome on Android; Safari, Chrome, Edge and Firefox on iPhone/iPad; Firefox, Safari, Edge and Chrome on a computer. |
| Opened from WhatsApp | A link opened inside WhatsApp (or Instagram, Facebook, Gmail…) runs in that app's small browser, which cannot install anything: Help says so and how to open it in the browser first. |
| Tests | `installHelp.test.ts` (browsers recognised); new `e2e/install.mjs` (7 checks: Firefox on Android, WhatsApp, iPhone, nothing shown once installed). |
| Guides | User guide sections 1 and 15; Admin guide section 8. |

## 26 Oct 2026 (evening): create a user from the Mac; account for Lou Canava

| What | Detail |
|---|---|
| New request | `create-user` can now be asked through Claude: `requests\create-user.request` holds `username|e-mail`. The PC makes a random 16-character temporary password, creates the account, and sends the password **only to your Mac** (Downloads, `YYMMDD_Tasks-account-<username>.txt`, with the steps to give them). It is never written to a log or a result, so Claude never sees it. Delete the file once passed on. |
| `create-user.bat` at the PC | Unchanged (asks for the password). |
| Account created | `LouCanava` (lou.canava@gmail.com). |
| Guides | Admin guide sections 2, 8 and 10. |

## 26 Oct 2026 (evening): new guides reach the Mac by themselves

| What | Detail |
|---|---|
| Automatic | Whenever the User guide or the Admin guide changes on the PC, a dated copy is sent to the Mac's **Downloads** folder through Tailscale: `YYMMDD_Tasks-user-guide.pdf`, `YYMMDD_Tasks-admin-guide.pdf` (a second version on the same day gets `-2`). Within a few minutes when the Mac is awake; otherwise as soon as it wakes (retried every hour). |
| Never replaced | Dated names, so no copy overwrites another; nothing deletes them. Every version is also kept on the PC in `docs\guides-archive\`. |
| How | `Add-GuidesToOutbox` (`scripts\_common.ps1`), called every minute by "Tasks auto-update" (which then starts "Tasks weekly safeguard" to send) and by the safeguard itself. It remembers what was sent in `state\guides-sent.txt` (file time and SHA-256), so an unchanged guide is never sent twice. The first run sends today's two guides. |
| Guides | Admin guide sections 4 and 14 updated. |

## 26 Oct 2026 (evening): Weekly review starts with "Tidy your computer"

| What | Detail |
|---|---|
| New step 1 | **Tidy your computer**: two ticks, **Desktop folder** and **Downloads folder**. Anything worth keeping or doing becomes a task, then goes through step 2 (Inbox). The step shows how many are left and folds with a tick once both are done. |
| Ticks | Count for the current week (Monday to Sunday) and start again every Monday. Kept in your account (Vikunja settings), so a tick made on the Mac shows on the PC and the phone; offline, the device keeps it. Each account has its own. |
| Other steps | Unchanged, now numbered 2 to 8. |
| Tests | Unit tests for the weeks (`weeklyRoutine.test.ts`); `e2e/oct19.mjs`: the step, ticking, kept in the account after clearing the device, folding. |
| Guides | User guide section 10 and Admin guide section 9 updated. |

## 26 Oct 2026 (evening): "Single tasks" projects in Available; browser table; Admin guide

| What | Detail |
|---|---|
| Home → Available | Every open task of a project whose name starts with "Single tasks" (your **SINGLE TASKS PRO** and **SINGLE TASKS PERSO**) now shows in **Available**, without needing the `next-action` label: each one-off task is its own next step. Tasks labelled `waiting-for` stay out. A `p1`, overdue or `today` task still shows in Red or Today first. Unit test added. |
| User guide | Section 1: a table of the browsers that can install the app on a Windows PC, a Mac, Android and iPhone (instead of the Firefox note). Sections 6 and 7: "Single tasks" projects. 19 pages. |
| Admin guide (new) | `docs\Tasks-admin-guide.pdf`, 16 pages, for you: the system, managing from the Mac through Claude, leaving the PC, what runs by itself, alerts, backups and restore, updates and undo, other users, automations, every script, a new PC, troubleshooting, security. Sources in `app-source\admin-guide\`. |
| Rule from now on | Every change updates the User guide and the Admin guide (and this changelog). |

## 26 Oct 2026 (afternoon): automations on by default; user guide corrected

| What | Detail |
|---|---|
| Automations on by default | For a new account the app switches them on by itself (about 15 s after opening). Someone who turns them off keeps them off: the PC remembers it (`declined.txt` in their folder). Yours: unchanged (main account). |
| Phone help text | "New task" on the home screen only works for an app installed from Chrome or Brave on Android: said so (not with Firefox or on iPhone). |
| User guide (`docs\Tasks-user-guide.pdf`) | Firefox works (Android install too); the home-screen "New task" and Share only with Chrome/Brave on Android, with a clearer explanation of Share; a key combination to add a task from anywhere on a computer (Windows shortcut key, Mac Shortcuts app); a task opens with the + at the right of its row (clicking the title renames it); automations on by default. |
| Tests | `e2e/accounts.mjs` 25 checks (on by default; switched off stays off). |

## 26 Oct 2026: other accounts get the automations; "Download my data"; a bug in the automations fixed

| What | Detail |
|---|---|
| Automations for every account | Help > Automations: **Turn on / Turn off** for your own account. Yours is always on (managed on the PC). For another account, the app creates a key limited to what the automations need and gives it to the PC, which runs a separate copy for that account only. Labels are found by name in each account (created if missing) instead of fixed numbers. The health check shows "running for you and N other accounts" and checks each account's data on its own. |
| Download my data | Help > My data: a table for Excel (one row per task: project, labels, dates, notes, Bin) or everything (complete file). Only the signed-in account, made on the device, works with the PC off. A reminder once a month (at most once a week) if the last copy is older than 30 days. |
| Backups | Unchanged: the nightly backup and the copies to your Mac contain everything (all accounts). |
| Bug fixed in the automations | When they changed one thing on a task (adding a missing start date, clearing one in a pending project), Vikunja emptied the task's other fields: due date, notes, priority. Moving a pending project back to its place was refused. Each change now sends the task's or project's current values. **Checked against the backups: none of your tasks lost anything** (the 8 tasks concerned since 10 Oct had no due date, notes or priority). |
| Tests | `e2e/accounts.mjs` (24 checks, with a second account), 5 new automation tests (76 in total). |

## 25 Oct 2026 (night): an open app now really moves to a new version

The PC warned "App versions": the Mac still ran the 17:16 version three hours after the 17:42 one went live. The app had noticed the new version and reloaded itself, but before the new version had finished downloading to the Mac, so the reload showed the old one again; and it only tries once per session. On a slow connection (the Mac and the phone go through the internet) this happened every time. Now it waits until the new version is fully on the device, then reloads. Reproduced with a slow connection on the previous version, fixed on the new one (`e2e/sw-update.mjs`).

## 25 Oct 2026 (evening): the filter box at the top of the home page

| What | Detail |
|---|---|
| Where | At the top of the home page, before Today. Empty, it is a single search box. |
| Typing | Shows the matching tasks at once (title, notes, label names, project name) in place of the blocks, and proposes the matching labels: Enter turns one into a chip. |
| Other criteria | Due date and project appear only once something is chosen. "All of them / Any of them" with two labels or more, "not" on a chip, as before. |
| Gone | The list of "all the other tasks" under Available, and the separate "Words" box. |
| Not remembered | The home page always opens on Today, Red, Available; × or Esc clears the filter. |
| Tests | `e2e/self-filter.mjs` rewritten (34 checks, computer and phone). |

## 25 Oct 2026 (evening): a harmless browser notice no longer counts as an error

"ResizeObserver loop completed with undelivered notifications" (9 times on the Mac) is a notice from the browser about page layout, not a fault of the app: nothing failed. The app no longer records it, and the health check ignores those already sent.

## 25 Oct 2026: losing the network is not a "device error"

The Mac showed "Device errors (24 h): Partially synced: offline": its network dropped in the middle of a sync (waking up, Wi-Fi). That is normal for a laptop or a phone and fixes itself at the next sync. The app now just shows "offline" in that case, and the health check no longer counts it. Real faults (server refusals, crashes, other sync failures) still count.

## 25 Oct 2026: Help button on the phone

The **?** (Help and settings: status, Error report, alerts…) was hidden on narrow screens. It is now in the top bar on phones too, between the sync dot and the right panel. Installed by the PC by itself (auto-update).

## 22 Oct 2026 (night): updates without you at the PC

You asked to update from the Mac without clicking at the PC.

| What | Detail |
|---|---|
| New task "Tasks auto-update" | Set up by `scripts\install-auto-update.bat` (once, as administrator). Every minute it checks for work and otherwise does nothing. |
| App updates | When `app-next.zip` appears, it runs `deploy-app` by itself and checks the new version is live. If the new version doesn't answer, the previous one is put back automatically, as before. A file that is not an app build is refused. |
| Other actions on request | Claude drops `requests\<name>.request`. Only `update-vikunja`, `restart-server`, `health-check-now`, `repair-services`, `backup-now` and `rollback-app` can be run; anything else is refused. `rollback-vikunja` stays with you at the PC. |
| Results | `requests\<name>.result.txt`, `state\auto-update-history.log`, and a new **Auto-update** line in Help > Status (a warning if the last one failed). |
| Scripts changed | `restart-server`, `health-check-now`, `backup-now` and `rollback-app` can now run without a window (`-NoPause`), as the others already could. `repair-services` warns if the auto-update task is missing. |
| Tested | On a test copy: an app update applied, a broken zip refused, a fresh zip (still copying) left for the next minute, an unknown request refused, a failed script reported as failed, one run at a time. |

## 22 Oct 2026 (night): what the warnings revealed

From a review of 30 days of errors, warnings and alerts.

| What | Detail |
|---|---|
| App left open across an update | It opened a page of the old version that was gone and showed "500 Internal Error" (the Mac). Now it opens that page fresh by itself, once. |
| Error page | Says what happened, that changes not sent are kept, with **Reload** and **Home**. |
| Server address lost | The Mac had lost its server address while still signed in, so it could not fetch anything (20:50–21:18). If that happens again, the app uses the usual address next to it. |
| Inbox safety net | It wrote false alarms ("would have left the Inbox") each time you came back to the Inbox: it looked at the list in the split second before it was updated. Fixed; nothing was ever lost or hidden. |
| "Run a health check" | A warning found is no longer recorded as an app error. |
| PC start-up | The health check waits up to 2 minutes for Vikunja, and checks Tailscale twice, before calling them down: no more false "Server problem" right after the PC starts. |
| App versions | Every device tells the PC which version it runs (once an hour). New check: a device still on an old version 2 h after a new one went live (the PC app had stayed on the 10 Oct version). |
| For you | Tailscale on the Mac (backup copies wait on the PC since 21 Oct 09:22); the PC charger. |
| Tests | `e2e/oct22b.mjs` (6 checks; the false alarms reproduced on the previous version first). |

## 22 Oct 2026: Mac project folders automation stopped

At your request. `mac/4-stop-project-folders.command` (run once on the Mac) stops the Mac poller and its watchdog. **No folder is deleted, moved or renamed**; you create folders yourself from now on. The weekly `report_<date>.txt` in `areas` stops too (the app's Weekly review shows the same: projects without a next action). The PC automations carry on. Details and undo: [AUTOMATIONS.md](AUTOMATIONS.md).

## 22 Oct 2026: back after deleting; "Got it" on warnings

| What | Detail |
|---|---|
| Delete on a task page | Takes you back to the page you came from (Inbox, a project, a review…), not always to the home page. Opened directly (a link, a reload): the home page. Esc does the same. |
| "Got it" on a warning | In Help > Status, each warning (orange) has a **Got it** button. It stops that warning on all your devices at once, and it comes back only if the situation changes. Problems (red) cannot be acknowledged. Details in [ALERTS.md](ALERTS.md). |
| PC tools | `tools\serve_app.py` (new `/ack-warning`) and `tools\healthcheck.py` (applies the acknowledgements). Both take effect with `scripts\deploy-app.bat`, which restarts the app server. |
| Add a task inside a project | **Add a task to this project…** at the bottom of the project's list: type a title, Enter (the box stays ready for the next one). The task is created in that project and **validated at once**, so it does not go through the Inbox. Set its labels, dates, repeat and the rest in its row (same controls as in the Inbox) or on its page. The project's tasks are now listed oldest first, so a new task goes to the bottom and stays there. |
| Fix found on the way | A change made to a new task just as it reached the server (for example validating it straight away) could be lost: it was sent under its temporary id. It now goes to the real one, and labels set meanwhile are kept. |
| Test | `e2e/oct22.mjs` (20 checks). |

## 21 Oct 2026 (night): the real cause: changed tasks dropped to the bottom of the Inbox

When you change a task, Vikunja 2.7's reply gives it an empty creation date (year 1). The app stored that date, so the task counted as the oldest one and dropped to the **bottom** of the Inbox (newest first) until the next reload. In a long Inbox that is out of sight, so it looked as if the task had vanished. Now the app ignores that date in the reply, and the task keeps its place. `e2e/sticky.mjs` checks this (the previous version fails it). The safety net from the evening entry stays.

## 21 Oct 2026 (evening): Inbox tasks no longer vanish on screen

You reported that a task given a project disappeared from the Inbox on the PC and came back after a reload. The server always had it right ("to validate"); only the screen of that device lost it, and I could not reproduce it here.

| What | Detail |
|---|---|
| Safety net | Once a task is shown in the Inbox, it stays on screen until **you** validate, complete or bin it, whatever the device believes in between. |
| Trace | If that safety net ever has to step in, the app writes a "trace" line with what the device saw (project, labels, rule in force). It reaches the PC with the other device errors and appears in the **Error report**, so the real cause can be found. It does not raise an alert. |
| Test | New `e2e/sticky.mjs`: simulates the faulty state, checks the task stays, the trace is written, and validating still takes it out. |

## Not done (and why)

| Item | Why | Next step |
|---|---|---|
| Running the Mac and phone clean-up | No access to those devices from here | Scripts and checklist in [START-HERE.md](START-HERE.md), or link the conversation to the Mac |
| Applying the new settings and app on the PC | I can write files on the PC but not run anything there | `MORNING.bat` (one double-click) |
| Native (store) apps | Not needed: the installed web app covers icon, window, offline, share and shortcuts. A native wrapper adds store accounts and maintenance for little gain | Ideas, if ever needed |
| New features from other apps | You asked to validate first | [IDEAS.md](IDEAS.md) |
