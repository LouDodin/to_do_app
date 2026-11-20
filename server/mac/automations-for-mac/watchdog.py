#!/usr/bin/env python3
"""Independent supervisor for the Vikunja automation. Run every 3 minutes by its own LaunchAgent
(com.loudodin.vikunja-watchdog.plist), completely separate from the poller (webhook_listener.py).

It does three jobs, each isolated from the others (one failing never stops the rest):

1. POLLER ALIVE?  webhook_listener.py writes heartbeat.txt every cycle. If it is older than
   5 minutes on two checks in a row (a debounce that avoids a false alarm while the poller is
   still starting), a macOS notification fires (at most one per 30 minutes).
   This job deliberately imports nothing from the poller: a bug there must never silence it.

2. HEALTH CHECKS, every 30 minutes (healthcheck.py): data drift, relations, labels, duplicates,
   database integrity, backups, disk space, recent poller errors. Only failures notify, each at
   most once every 6 hours; warnings and notes go to healthcheck_last.json.

3. DAILY BACKUP of the Vikunja database (SQLite online backup, 14 days kept) in backups/.

Standalone use:  python3 watchdog.py            (does what launchd does)
                 python3 watchdog.py --force    (run the 30-minute checks and the backup now)
"""
import json
import os
import subprocess
import sys
import time
from datetime import date, datetime

# Mac only: on the PC the scheduled task restarts the poller and the hourly health check
# (tools\healthcheck.py) watches its heartbeat and errors.
BASE_DIR = os.environ.get("AUTOMATION_DIR", os.path.dirname(os.path.abspath(__file__)))
STATE_DIR = os.environ.get("AUTOMATION_STATE_DIR", BASE_DIR)
HEARTBEAT_FILE = os.path.join(STATE_DIR, "heartbeat.txt")
STATE_FILE = os.path.join(STATE_DIR, "watchdog_last_sent.json")
LOG_FILE = os.environ.get("AUTOMATION_LOG", "/tmp/vikunja_automation.log")

HEARTBEAT_STALE_SECONDS = 5 * 60
NOTIFY_COOLDOWN_SECONDS = 30 * 60
REQUIRED_CONSECUTIVE_BAD = 2  # ~6 minutes of genuine staleness at a 3-minute schedule
HEALTH_INTERVAL_SECONDS = 30 * 60


def log(msg):
    try:
        with open(LOG_FILE, "a") as f:
            f.write(f"{datetime.now().isoformat()} [watchdog] {msg}\n")
    except OSError:
        pass


def mac_notify(title, message):
    try:
        esc = lambda s: s.replace("\\", "\\\\").replace('"', '\\"')
        script = f'display notification "{esc(message)[:250]}" with title "{esc(title)}" sound name "Basso"'
        subprocess.run(["osascript", "-e", script], timeout=5, check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


def load_state(path=STATE_FILE):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(state, path=STATE_FILE):
    try:
        with open(path, "w") as f:
            json.dump(state, f)
    except OSError:
        pass


def heartbeat_age(path=HEARTBEAT_FILE, now=None):
    """Seconds since the last heartbeat, or None when missing / unreadable."""
    now = now or datetime.utcnow()
    try:
        with open(path) as f:
            beat = datetime.strptime(f.read().strip(), "%Y-%m-%dT%H:%M:%SZ")
        return (now - beat).total_seconds()
    except FileNotFoundError:
        return None
    except (ValueError, OSError) as e:
        log(f"could not read heartbeat file: {e}")
        return None


def decide_poller_alert(age, state, now_ts):
    """Pure decision: returns (message_or_None, new_state). A single bad reading is only logged."""
    state = dict(state)
    if age is not None and age <= HEARTBEAT_STALE_SECONDS:
        state["consecutive_bad"] = 0
        return None, state
    state["consecutive_bad"] = state.get("consecutive_bad", 0) + 1
    if age is None:
        message = "No heartbeat file found: the poller may never have started, or its folder is missing."
    else:
        message = f"No heartbeat from the poller in {int(age // 60)} min. It may have crashed or stopped."
    if state["consecutive_bad"] < REQUIRED_CONSECUTIVE_BAD:
        return None, state
    last = state.get("stale_heartbeat")
    if last is not None and now_ts - last < NOTIFY_COOLDOWN_SECONDS:
        return None, state
    state["stale_heartbeat"] = now_ts
    return message, state


def job_poller_alive():
    state = load_state()
    message, state = decide_poller_alert(heartbeat_age(), state, time.time())
    save_state(state)
    if message:
        log(message)
        mac_notify("Vikunja automation may be down", message)


def due(state, key, interval, now_ts):
    last = state.get(key)
    return last is None or now_ts - last >= interval


def job_health(force=False):
    state = load_state()
    now_ts = time.time()
    if not (force or due(state, "health_ran_at", HEALTH_INTERVAL_SECONDS, now_ts)):
        return
    state["health_ran_at"] = now_ts
    save_state(state)
    import healthcheck  # imported late: if it is broken, job 1 above has already run
    results = healthcheck.run_all("api")
    with open(healthcheck.REPORT_FILE, "w") as f:
        json.dump({"at": datetime.now().isoformat(), "results": [r.__dict__ for r in results]}, f, indent=1)
    sent = healthcheck.notify_failures(results, send=mac_notify)
    fails = [r.name for r in results if r.level == "fail"]
    log(f"health check: {len(results)} checks, failures: {fails or 'none'}, notified: {sent or 'none'}")


def job_backup(force=False):
    state = load_state()
    today = date.today().isoformat()
    if state.get("backup_day") == today and not force:
        return
    import healthcheck
    try:
        db_path = healthcheck.pick_db_path()
    except FileNotFoundError:
        # Since 9 Oct 2026 the database lives on the PC, which backs it up every night.
        state["backup_day"] = today
        save_state(state)
        return
    path, made = healthcheck.backup_database(db_path)
    state = load_state()
    state["backup_day"] = today
    save_state(state)
    log(f"backup {'written' if made else 'already existed'}: {path}")


def run_isolated(name, fn):
    try:
        fn()
    except Exception as e:  # a failing job is logged and reported, never allowed to stop the others
        log(f"{name} failed: {e!r}")
        try:
            healthcheck_notify = f"{name} failed: {e}"
            mac_notify("Vikunja watchdog", healthcheck_notify)
        except Exception:
            pass


def main(force=False):
    run_isolated("poller check", job_poller_alive)
    run_isolated("health checks", lambda: job_health(force))
    run_isolated("backup", lambda: job_backup(force))


if __name__ == "__main__":
    main(force="--force" in sys.argv)
