# Alerts: every warning and problem

One list, one wording, everywhere (updated 21 Oct 2026).

## How they work

- **Two levels only.**
  - **Problem** (red): act today. Devices cannot sync, your data is at risk, or a security fix is waiting.
  - **Warning** (orange): act when convenient. Something needs attention; nothing is broken yet.
- **The same words everywhere:** "Tasks problem: <check>" / "Tasks warning: <check>" on your phone, "Server problem: <check>" / "Server warning: <check>" in the app's bar, the same check name in Help.
- **Each one says what to do**, in one sentence, next to it in Help (?) > Status.
- **"Got it" on a warning** (Help > Status), since 30 Oct 2026 in two scopes. **Just me**: hidden for you, on all your devices; the others still see it. **Everyone** (only you, the admin): hidden for everyone it concerns. Another user's "Got it" only ever hides it for them. It comes back if the situation changes (a new interruption, a new error, a different version). For Power, Off-PC copy, Server log size and Server errors, whose text only counts time, it comes back once the check has been OK again and then warns anew. Problems (red) cannot be acknowledged: they must be fixed. Kept on the PC in `state\acknowledged.json` (everyone) and `state\acknowledged-users.json` (per person). Your own "Got it" also silences your phone alerts and PC notifications for it.
- **Who sees what** (30 Oct 2026). Some checks concern one account only: its devices (**Device errors**, **App versions**) and its automations (**Automations**, **Automation errors**, **Automation data checks**). They have one line per account: yours under the usual name, another account's with " · <username>" (e.g. "Device errors (24 h) · Alex"). **You (the admin, the main account) see every line of every account**, each with **Concerns:** (everyone, you, or the account) and **Cause:** (which device of whom, e.g. "Alex · phone (Firefox, …)"), so you can act before they tell you. Since 10 Nov 2026 each one also says **Seen by:** who has it on screen (everyone; you and the account; only you; only this device; nobody any more once hidden for everyone). The other users see the server's checks and their own lines only; without signing in, only the server's. Devices that ran an app older than 30 Oct do not say whose they are: "· unknown account", shown to you only.
- **Where you see them:**

| Where | What |
|---|---|
| Bar under the top bar, on every device | The worst one (red or orange), with "+N" if there are more. Tap it for Help > Status. × hides it until the next report. |
| Help (?) > Status | All of them, each with what to do. **Run a health check** checks again now. |
| Your phone (ntfy), reminders | Since 19 Nov 2026: "Tasks: reminder" at the time set on a task (task page › Remind), sent by the PC (`automations/reminders.py`) to the task owner's topic. Generic text, a tap opens the task. "(late)" when the PC was off at that time (dropped after 12 h). |
| Your phone (ntfy) | Once when things get worse, once when they are all OK again ("Tasks: all OK again"). Never every hour. Generic text only. |
| The PC | A Windows notification for the same. |
| Help > **Error report (30 days)** | All of it, over a month, for Claude. |

## Checked by the PC every hour

| Check | Problem when | Warning when | What to do (short) |
|---|---|---|---|
| Vikunja server | not answering (after waiting up to 2 min, so a PC just starting is not an alarm) | — | `restart-server` |
| App server | not answering, or the page is wrong | — | `restart-server` / `rollback-app` |
| Sign-ups | anyone can create an account | — | close sign-ups, `restart-server` |
| API compatibility | Vikunja changed fields the app uses | the read-only check token is missing or refused | `rollback-vikunja` / new token |
| Tailscale | not installed, disconnected, signed out (checked twice, 30 s apart) | — | open Tailscale, connect |
| Public addresses (Funnel) | off or incomplete | — | `restart-server` |
| Public Vikunja / app address | wrong or expired certificate | certificate expires soon, not renewed yet | restart Tailscale |
| Windows task "…" (Vikunja, Tasks app, Vikunja backup, Tasks health check, Tasks automations) | missing, disabled or stopped | — | `repair-services` |
| Backups (on the PC) | none, older than 30 h, or failed its check | — | `backup-now` |
| Off-PC copy (to the Mac) | — | not set up, or **no copy on the Mac for 10 days** | wake the Mac with Tailscale on |
| Disk space | under 3 GB free | under 10 GB free | free space on C: |
| Database | missing or damaged | could not be read this time | `restore-backup` |
| Data consistency | — | leftovers of deleted things | Error report to Claude |
| Automations | stopped (no cycle for 5 min) or never started | — | `restart-server` |
| Automation errors (12 h) | — | errors in the last 12 h | nothing if one-off |
| Automation data checks | loops, missing labels or projects | duplicates, broken links, stale labels, Bin over 30 days, moved folders | Error report to Claude |
| Auto-update | — | the last automatic update or request failed (last 3 days) | ask Claude; a failed app update has already put the previous version back |
| App versions | — | a device used in the last 3 days still runs an old version 2 h after a new one went live | reload the app there; reinstall if it stays old |
| Device errors (24 h) | — | a device had sync failures, refused changes or crashes | nothing if one-off; Error report |
| Server errors (last hour) | — | errors in Vikunja's log | nothing if one-off |
| Server log size | — | over 100 MB | `restart-server` |
| PC: the server's programs | — | (admin only) a script of the server running far too long (`auto-update.ps1` > 45 min, `healthcheck.py` > 30 min, others > 3 h) or a listener (`run_poller.py`, `ntfy-listen.ps1`, `notify.ps1`) twice: **stopped by itself** and said here (since 12 Nov 2026; `tools\pc-load.ps1`, log `state\pc-load-stopped.log`; switched on by `state\pc-load-stop.txt`). Only processes whose program is in `todo-server` or an interpreter running a `todo-server` script; never the user's apps. Vikunja or the app server twice: warning | `restart-server` |
| PC: busy programs | — | (admin only) a program at ≥ 15 % of the processor or ≥ 1.5 GB of memory (10-second sample) at **3 hourly checks in a row** (`state\pc-load.json`). Windows, updates (TiWorker, TrustedInstaller, MoUsoCoreWorker…), Defender, search, drivers, Tailscale, OneDrive and the server's own are never reported | close it; restart the PC |
| PC: start-up programs | — | (admin only) a program that starts with Windows (switched on in Task Manager › Startup apps) other than Windows, Defender, drivers (Realtek, NVIDIA, Intel, AMD…), Tailscale, OneDrive, Claude | disable it, or "Got it" |
| Power | **really on battery for 1 h 30, or 20 % or less** (since 11 Nov 2026; 1 h on 10 Nov; before: a warning after 4 h). "Really": Windows' power line flag (`root\wmi BatteryStatus.PowerOnline`) says unplugged and the charge has dropped by 3 points or more (a full battery on the charger says "discharging": five false alarms on 10–11 Nov). Watched every minute by `auto-update.ps1`: an **urgent** phone notification at once (ntfy priority 5, "Tasks problem: Power (…)"), once per stage, and an immediate health check | — | plug the charger in now |
| Sleep | — | the PC may sleep on mains power | `repair-services` |
| Interruptions | — | the PC was asleep or off for over 2.5 h in the last 24 h | `diagnose-power` if you do not know why |
| Vikunja version | a new version with security fixes | a new version | `update-vikunja` |

`name` = `scripts\name.bat` on the PC. Details: [TROUBLESHOOTING.md](TROUBLESHOOTING.md) and [OPERATIONS.md](OPERATIONS.md).

## Checked by each device

| Check | Level | When | What to do |
|---|---|---|---|
| Connection to the PC | problem | this device cannot reach the PC (your changes wait on it) | check the PC is on, plugged in, online |
| Health check | warning | no report from the PC for 3 h | `health-check-now`, then `repair-services` |
| **Tasks problem: sync stuck** (phone alert) | problem | a device has not synced for 15 min | open Tasks there, Help > Status |
| **Tasks problem: signed out** (phone alert) | problem | the server signed a device out (not when you sign out yourself) | sign in again on that device |
| Messages in the app | — | something you tried could not be done ("choose a project first"…), or a sync error | shown once every 10 min; all of them go into the Error report |

Phone alerts are sent only while the app is open on that device, and only if your ntfy topic is set (Help > Alerts).
