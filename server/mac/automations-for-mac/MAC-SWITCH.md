# Switching the Mac to "folders only" (10 Oct 2026)

For the Claude session on the Mac. Written by the PC session.

## What changes

The PC now runs the label / project / date automations (role `server`). The Mac keeps the
project-folder mirror and the weekly report (role `folders`). One `webhook_listener.py` serves both
machines; the role decides which steps run. It is read every cycle from `poller_role.txt`.

Never run role `all` (the old behaviour) on the Mac while the PC runs. They would race on labels
and dates.

## Files in this package

| File | Change |
|---|---|
| `webhook_listener.py` | Has roles. Reads the token from `api_token.txt` (no token in the code). UTF-8 logs. Atomic state writes. Retries a 5xx once. Looks back 2 minutes on "updated > since". Has `--once` and `--check`. The automation logic is unchanged. |
| `healthcheck.py` | Reads the token from `api_token.txt`. Falls back to local time without a time-zone database. Links between tasks in the Bin are no longer reported as dangling. |
| `watchdog.py` | The daily backup is skipped when there is no local database (it is on the PC now). |
| `folder_sync.py` | Unchanged. |
| `test_poller.py` | New tests for the roles. The other tests are as before, plus one Bin test. |

## Steps (in `~/vikunja-automation`)

1. Back up the current files:
   ```sh
   cd ~/vikunja-automation && mkdir -p before-split-2026-10-10 && cp *.py before-split-2026-10-10/
   ```
2. Move the token out of the code, into `api_token.txt` (mode 600), **before** replacing the code:
   ```sh
   python3 -c "import re;print(re.search(r'API_TOKEN = \"(tk_[0-9a-f]+)\"', open('webhook_listener.py').read()).group(1))" > api_token.txt && chmod 600 api_token.txt
   ```
3. Set the role. The current code ignores this file:
   ```sh
   echo folders > poller_role.txt
   ```
4. Run the tests from this package, in a scratch folder:
   ```sh
   python3 -m unittest test_poller test_healthcheck test_folder_sync test_watchdog
   ```
   They should report 67 tests, OK.
5. Run one read-only check, then one folders cycle:
   ```sh
   python3 webhook_listener.py --check
   python3 webhook_listener.py --once --role folders
   ```
   Both should report 0 problems.
6. Copy the five `.py` files from this package into `~/vikunja-automation`. The running poller
   notices the new code, exits, and launchd starts the new version.
7. Check `/tmp/vikunja_automation.log`. It should show
   `Starting poller (role folders, server https://pc-lou.tailc45f62.ts.net)`, then folder activity
   only: no "Marked task … overdue", no "Synced PENDING-exclusion".
8. Tell the user the Mac is switched. They then run `start-automations.bat` on the PC.

Keep the watchdog LaunchAgent. It still watches the heartbeat of the folders poller.

## Undo

If the PC automations are stopped (`stop-automations.bat` on the PC), run `echo all > poller_role.txt`
on the Mac. It takes effect on the next cycle. To restore the old code, use `before-split-2026-10-10/`.

## Cleaning up later

After a few days of the PC running them:
- delete `before-split-2026-10-10/`
- delete `last_check.txt`, `daily_last_run.txt`, `pending_*_ids_last.txt` and `notify_last_sent.json`
  (the PC keeps its own)
- delete the old package `~/Downloads/vikunja-automation-for-pc.zip`, which holds the token
