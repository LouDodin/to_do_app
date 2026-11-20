# Something does not work

**First, two things that fix most problems:**
1. On the PC, run `scripts\restart-server.bat`.
2. On the device, close the app and open it again.

Then look up the symptom below. Every script writes a log in `logs\`. If you ask Claude for help, give it the log and `state\health-report.html`.

## On a device (phone, Mac)

| Symptom | Likely cause | What to do |
|---|---|---|
| Grey/orange sync dot, "offline", changes "waiting" | The PC is off, asleep or without internet, or the device has no network | Nothing is lost: changes wait on the device and are sent when the server is back. Check the PC is on. Settings > This device says "unreachable" while it is off. |
| Red banner "Server problem: …" | The PC's hourly check found something | Tap it: Settings shows the problem and its fix |
| "A new version of the app is ready – Reload" | A new app version was installed on the PC | Tap Reload |
| Sent to the sign-in page | Your session expired (e.g. weeks offline), or you signed out | Sign in again. Changes made meanwhile are kept and sent afterwards |
| "That code is not valid" at sign-in | Two-factor code expired or reused | Wait for the next code |
| "Too many attempts" | Vikunja limits sign-in attempts (10 a minute, counted for everyone together because they all arrive through Tailscale) | Wait one minute |
| A task changed on the phone does not show on the Mac | The Mac has not synced yet | Bring the app to the front (it syncs at once) or wait up to 5 minutes |
| Settings > Changes lists "Refused by the server" | The server rejected a change (e.g. the task was deleted elsewhere) | Redo it if still needed, then "Clear this list" |
| The app does not open at all with no network | It was never opened on this device since it became installable, or the browser cleared its storage | Open it once while online. Install it (installed apps are not cleared) |
| Install option missing | Browser without install support (Firefox desktop), or private browsing | Use Chrome, Brave or Edge, or Safari on iPhone (Share > Add to Home Screen) |

## On the PC (health check lines)

Every check, its two levels (problem / warning) and what to do: **[ALERTS.md](ALERTS.md)**. The app shows the same, with the fix next to each one, in Help (?) > Status.

## Errors in vikunja.log

- Usually one line now and then is harmless (a device with an old session, a dropped connection).
- **Repeated errors** after an update: `rollback-vikunja`, then send the log to Claude.
- `database is locked`: something else is holding `vikunja.db`, such as an antivirus scan, a backup tool, or a copy in progress. Do not copy that file by hand while the server runs: use `backup-now`.

## After the PC was off for a long time

Everything restarts by itself. Devices sync when opened: changes made offline are sent first, then the latest data is downloaded. If a device was offline for weeks, its session may have expired: sign in again. Nothing waiting on it is lost.

## Undo table

| You did | Undo with |
|---|---|
| `deploy-app` | `rollback-app` |
| `update-vikunja` | `rollback-vikunja` |
| `restore-backup` | `restore-backup` again, choosing the file `vikunja\db\vikunja.db.before-restore-<date>` (copy it into `backups\` first), or ask Claude |
| Server settings (`MORNING.bat`, 10 Oct) | Rename `vikunja\run-vikunja.cmd.before-<date>` to `run-vikunja.cmd`, then `restart-server` |
| `cleanup-pc-apply` / Mac `3-cleanup apply` | Everything is in `_to_delete\<date>\`: move it back. After `cleanup-pc-empty`: restore it from the Recycle Bin |
| Mac `2-retarget-automations apply` (now in `setup-history\`) | Unpack `~/vikunja-automation-backup-<date>.tar.gz` |

## Ctrl+Alt+T (or the app in a browser on the PC) shows "500 Internal Error"

The server is fine: `scripts\diagnose-local.bat` showed it answers correctly from the PC itself (HTTP 200). The browser on the server PC could not use the PC's own *public* address. Fixed on 10 Oct (`setup-history\fix-quick-capture.bat`; run it again if it ever comes back). Ctrl+Alt+T then opens `http://127.0.0.1:5173/quick-add`; sign in once in that window. To use the full app in a browser on the PC, open `http://127.0.0.1:5173`.

## Every device is signed out / "nothing syncs" after the PC was off or asleep

- Your changes are kept on each device, so don't sign out, clear the app data or uninstall it. Sign in again, and the sign-in page says how many changes it will send.
- Since 18 Oct a session lasts 30 days without the server: a few days of a sleeping PC no longer sign devices out.
- To see why the PC slept or restarted, run `scripts\diagnose-power.bat` (right-click > Run as administrator) and give the result to Claude. The health check's "Interruptions" line shows when it happened.
