# Moving the server to another PC

Everything the server needs fits in one folder, `Documents\todo-server`, and one zip rebuilds it. The key to a painless move is to **give the new PC the same Tailscale name, `pc-lou`**. Then the addresses stay the same, and no device, installed app, shortcut or automation needs changing.

## 0. Be ready before it breaks

This is automatic since 19 Oct 2026, once `scripts\install-weekly-safeguard.bat` has been run. The PC sends copies to your **Mac** through Tailscale (Taildrop: encrypted from end to end, no cloud involved). They arrive in the Mac's **Downloads** folder:
- `tasks-data-<date>.db`: your database alone, made **once a day** (a few MB). So about one day of changes at most can be lost.
- `tasks-server-<date>.zip`: the full rebuild kit, made **every Sunday**. It holds your data, the server (Vikunja and its settings with the secret), the app and its source, tools, scripts and docs (this page is `docs\MOVE-TO-NEW-PC.md` inside it). Not the logs nor old versions.

The Mac is often asleep: copies wait on the PC (`state\offsite-outbox`) and are retried every hour, so they arrive the next time the Mac is awake with Tailscale on. The hourly health check shows an **Off-PC copy** line and warns you when nothing has reached the Mac for 10 days.

On the Mac, move these files to a folder of your choice from time to time, and delete old ones (keeping the last few zips and a few weeks of `.db` files is plenty). Keep them private: they hold your tasks and the server secret. The nightly backups in `backups\` stay on the PC's own disk, so they are lost with it; the copies on the Mac are not.

You can still make a zip by hand with `scripts\export-for-new-pc.bat` (to `Documents`), or send one now with `scripts\weekly-safeguard.bat`.

### If the PC is dead

1. Copy from the Mac to the new PC the newest `tasks-server-<date>.zip`, and the newest `tasks-data-<date>.db`.
2. Follow section 2 below with that zip (it unpacks to `todo-server\`).
3. If the `.db` file is newer than the zip, before step 2.2: put it in `Documents\todo-server\vikunja\db\` and rename it `vikunja.db` (replace the one there).
4. Run `scripts\install-weekly-safeguard.bat` on the new PC so the copies start again.
5. The phone and the Mac keep the changes they had not sent yet, and send them once the server is back. Changes they had already sent after the last daily copy are lost.

## 1. On the old PC (if it still works)

1. Run `scripts\export-for-new-pc.bat`. You get `Documents\todo-server-export-<date>.zip`. From then on, do not change tasks until the new PC runs: changes made after the export would not be in it.
2. In the Tailscale tray icon, choose **Log out**. Or later, in the Tailscale admin console, remove the old machine.
3. Optionally, turn the old PC off, or uninstall Tailscale from it.

If the old PC is dead, use your latest export zip.

## 2. On the new PC

1. Copy the zip and unpack it into `Documents`, so you get `Documents\todo-server\…`.
2. Double-click `todo-server\scripts\setup-new-pc.bat` and accept the admin prompt. It installs Python and Tailscale if they are missing.
3. **Tailscale:**
   1. Sign in with your usual account.
   2. In the [admin console](https://login.tailscale.com/admin/machines), remove the old `pc-lou` if it is still listed.
   3. On the new machine, choose ⋯ > **Edit machine name** > `pc-lou`.
   4. Back in the script, press Enter.
4. The script then runs `repair-services`, which:
   - creates the scheduled tasks, Funnel (approve the link if Tailscale prints one) and power settings
   - starts everything
   - runs a health check
5. Check:
   - open `https://pc-lou.tailc45f62.ts.net:8443` on the phone, on mobile data
   - `scripts\health-check-now.bat` shows all OK
6. In the Windows power settings, check the PC never sleeps when plugged in. `repair-services` sets this, but some laptops have their own tool. Also set the BIOS/UEFI to **power on after a power cut**, if it has that option.
7. Run `scripts\install-windows-quick-capture.bat` if you want Ctrl+Alt+T there.
8. The automations come with the export, switched off. If the old PC is dead or switched off for good, run `scripts\install-automations.bat`, then `scripts\start-automations.bat`. Never run them on two PCs at once.

Devices need nothing. They reconnect by themselves and send any changes they were holding.

## If the new PC cannot be called `pc-lou`

The addresses change to the new name. Then:
- **On each device,** install the app again from the new address and sign in. The old installed app points to the old address: uninstall it.
- **On the Mac:**
  - quick capture: edit `SERVER=` at the top of `~/Library/Application Support/Tasks/quick-capture.sh`
  - folder automations: set `VIKUNJA_URL` to the new address in `~/vikunja-automation/webhook_listener.py` (its first lines). The Mac session can do it.
- Nothing to change on the server: `repair-services` writes the new address into `vikunja\publicurl.txt` and the security settings follow it.

## Requirements for the server PC

- Windows 10 or 11, on all the time, connected to the internet (wired is best).
- About 200 MB, plus your data (a few MB) and 30 backups.
- On the Mac: about 40 MB a week for the full copy, plus a few MB a day.
- Python 3 (installed by `setup-new-pc`) and Tailscale (free account).
- No router settings, no domain, no Docker.
