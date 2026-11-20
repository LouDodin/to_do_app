# The GTD automations

## Everything that runs by itself (26 Oct 2026)

**On the PC, for every account** (on by default; anyone can turn them off for their own account in Help > Automations). Every minute, unless noted:

| Automation | What it does | When |
|---|---|---|
| Next-action chain | When a task is completed, each task that "follows" it gets `next-action` once all its predecessors are done (not inside a pending project) | Every minute |
| Clean-up on completion | Removes `next-action`, `today`, `overdue`, `last-day` from a completed task | Every minute |
| Start date | A task created without a start date gets one (its creation time); not in pending projects | Every minute |
| Overdue / last-day | `overdue` when the due date is past, `last-day` when it is today, neither otherwise | Every minute |
| Pending projects | Tasks of a pending project lose a start date already reached (so they do not surface); saved filters exclude pending projects; a pending project whose tasks reach their start date moves back to its real place | Every minute |
| Duplicate labels | Labels with the same name are merged into one | Once a day |
| Its own labels | The four labels above are found by name in each account, and created if missing | At start |

**Built into the app (every account, every device, nothing to switch on):** Inbox until validated; Bin kept 30 days then emptied; Today / Red / Available blocks; filter box; Tomorrow and Weekly reviews (including projects without a next-action); auto-update to the latest version; alerts after 15 min without sync (ntfy); "Download my data" with a monthly reminder.

**On the PC, for the whole server:**

| What | When |
|---|---|
| Backup of the database (all accounts) | Every night at 03:00, 30 kept |
| Copy to your Mac via Tailscale: the database (all accounts) daily, the whole server weekly | Hourly attempt, sent when the Mac is awake |
| Health check (30 checks, per account for the automations), warnings in the app and on your phone | Every hour |
| Auto-update: installs a new app version or runs a requested script | Every minute, only when something is waiting |

**Stopped:** the Mac's project-folder mirror and its weekly report (22 Oct 2026).

## How the automations run

One program (`automations\webhook_listener.py`) serves both machines. Its **role** decides which part runs:

| Role | Runs |
|---|---|
| `server` | Labels, dates and pending projects. This is the PC. |
| `folders` | Project folders and the weekly report. This is the Mac. |
| `all` | Everything, as before the split |

**Never run `server` or `all` on two machines at once**: they would undo each other's labels and dates.

## On the PC

| | |
|---|---|
| Code | `automations\` (with its tests and the original README describing every automation) |
| Runs as | The scheduled task "Tasks automations": SYSTEM, at start-up, restarted if it stops. `run_poller.py` waits for Vikunja, then runs the poller every 60 s. Only one copy can run at a time. |
| Server address | `http://127.0.0.1:3456` (no internet hop) |
| API token | `state\automation-token.txt`, readable only by you, the administrators and the system. It is not written in the code any more. |
| Memory (what was already processed) | `state\automations\` |
| Log | `logs\automations.log` (a new file starts at 20 MB) |
| Problems | `state\automations\errors.log` |

**How you hear about problems.** The hourly health check now has three more lines:
- **Automations**: running, or stopped for more than 5 minutes.
- **Automation errors (12 h)**: problems the automations reported.
- **Automation data checks**: their own checks, read from a copy of the database:
  - the four automation labels, duplicates
  - relations
  - projects and the project tree
  - saved filters that mention deleted labels or projects
  - wrong overdue / last-day labels (these only count when the automations are stopped, since they fix them within a minute)

A problem shows up like any server problem: a Windows notification, the red banner in the app on every device, and on the phone through ntfy if you set it up. The Mac's macOS notifications for the automations are replaced by this.

**Vikunja updates.** `update-vikunja` now also runs one full automation cycle against the new version, on the test copy of your data, before switching. If an update would break an automation, it is refused, the same way as for the app.

**Restarts.** `restart-server`, `update-vikunja`, `rollback-vikunja` and `restore-backup` stop the automations while the server is down, then start them again. They do not log "server unreachable" errors.

## On the Mac

**22 Oct 2026: stopped, at your request.** The Mac no longer mirrors projects as folders nor writes the weekly report. `mac/4-stop-project-folders.command` stops its two services (the poller and its watchdog) and keeps their settings in `~/vikunja-automation/disabled-2026-10-22/`. Nothing in `areas` is deleted, moved or renamed: the existing folders stay as they are and you manage them by hand. The PC automations (labels, dates, pending projects) are not affected. Undo: the last line the script prints.

What it did until then, for the record: every minute, for each project inside an AREA (a top-level project in CAPITALS), it kept a folder `areas/<AREA>/<YYMMDD>_<project>` (sub-projects inside), moved it to `pending_projects/` or `archived_projects/<start>_<end>_<project>` when the project changed state, and renamed it when the project was renamed. It never deleted anything. Every 7 days it wrote `areas/report_<date>.txt` (projects without a next action, broken links).

The rest of this section describes the setup before that date.


`~/vikunja-automation` keeps running with role `folders`. It reads the role from `poller_role.txt` at every cycle. Its watchdog still watches its heartbeat. The daily backup it used to make is skipped, because the database is on the PC and the PC backs it up every night. The steps are in `mac/automations-for-mac/MAC-SWITCH.md` (also inside `automations-for-mac.zip`).

## Moving day (10 Oct 2026): the order matters

1. **PC:** double-click `scripts\install-automations.bat`. It:
   - takes the token from the Mac package in Downloads and locks it down
   - copies what the Mac had already processed
   - runs the tests
   - checks the server read-only
   - installs the task, **switched off**
2. **Mac:** send `automations-for-mac.zip` (in the PC's Downloads) to the Mac with Tailscale. In the Mac's Claude session, paste: "Follow MAC-SWITCH.md in automations-for-mac.zip from the PC session: switch the Mac poller to folders only." The Mac session tells you when it is done.
3. **PC:** double-click `scripts\start-automations.bat` and type YES. It switches them on, waits for the first cycle and shows the result.
4. **A few days later:**
   - the PC clean-up (`cleanup-pc`) moves the Mac package out of Downloads (it holds the token)
   - the Mac session removes its leftovers (listed at the end of MAC-SWITCH.md)

**To go back to the Mac:** `scripts\stop-automations.bat` on the PC, then `echo all > ~/vikunja-automation/poller_role.txt` on the Mac.

## Scripts

| Script | |
|---|---|
| `install-automations` | Installs or updates them. Safe to run again: it keeps their memory and does not switch them on. |
| `start-automations` | Switches them on (only when the Mac runs `folders`) |
| `stop-automations` | Switches them off (they stay installed) |

`repair-services` re-creates their task too, on or off as it was.

## What changed in the code (the logic of each automation is unchanged)

- Roles: one program for both machines.
- Token read from a file, not written in the code.
- Paths, log and state locations come from the settings, so the Windows paths work.
- UTF-8 everywhere: accented and emoji task titles would have crashed logging on Windows.
- State files are written all at once, so a reader never sees half a file.
- A server error is retried once: SQLite can be busy for a moment while the app syncs.
- Completed tasks are looked for with a 2-minute overlap. Before, a task completed in the same second as the previous check could be missed. Every step is safe to repeat.
- `--check` (read-only start-up check) and `--once` (one cycle, used by the tests and by `update-vikunja`).
- Health check:
  - links between two tasks in the Bin are no longer reported as dangling (they come back together when restored)
  - it works without a time-zone database (Windows)
- Tests: 67, all passing (the PC runs the 53 that do not need the Mac's folders). They were also run against a real Vikunja 2.7 with a copy of your data from this morning: overdue and last-day labels, start-date backfill, next-action propagation and label clean-up on completion, pending projects and the saved-filter exclusion, and labels removed when a due date moves.
