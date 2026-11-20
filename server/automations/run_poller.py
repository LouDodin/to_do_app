"""Runs the automations on the PC: the scheduled task "Tasks automations" starts this file.

It sets the PC settings, waits until Vikunja answers, then runs webhook_listener.py (role
"server": labels, projects, dates) and starts it again whenever it stops: after an update of
its code (it exits by itself to load the new version) or after a crash (with a growing pause,
so a broken version cannot spin).

Since 26 Oct 2026 it runs one poller per account: yours (state\\automation-token.txt, memory in
state\\automations) and one for every account that switched the automations on in the app
(Help > Automations): state\\automations\\users\\<username>\\api_token.txt, with its own memory
there and its log in logs\\automations-<username>.log. An account switched off (its token file
removed) has its poller stopped within half a minute.

It also sends the task reminders to the phones, every minute (reminders.py, 19 Nov 2026).

Only one copy can run at a time (a lock in state\\automations\\poller.lock).
Logs: logs\\automations.log. Problems: state\\automations\\errors.log, read by the hourly
health check (Windows notification, app banner, phone).
"""
import os
import subprocess
import sys
import time
import urllib.request
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import reminders  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STATE_DIR = os.path.join(ROOT, "state", "automations")
LOG_FILE = os.path.join(ROOT, "logs", "automations.log")
SETTINGS = {
    "VIKUNJA_URL": os.environ.get("AUTOMATION_TEST_URL", "http://127.0.0.1:3456"),  # override for tests only
    "AUTOMATION_ROLE": "server",
    "AUTOMATION_DIR": HERE,
    "AUTOMATION_STATE_DIR": STATE_DIR,
    "AUTOMATION_LOG": LOG_FILE,
    "VIKUNJA_TOKEN_FILE": os.path.join(ROOT, "state", "automation-token.txt"),
}


def log(msg):
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"{datetime.now().isoformat()} [supervisor] {msg}\n")
    except OSError:
        pass


def single_instance():
    """Holds an exclusive lock for as long as this process lives (released by Windows if it dies)."""
    os.makedirs(STATE_DIR, exist_ok=True)
    handle = open(os.path.join(STATE_DIR, "poller.lock"), "a+")
    try:
        if sys.platform == "win32":
            import msvcrt
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return None
    return handle


def server_answers(url):
    try:
        with urllib.request.urlopen(url + "/api/v1/info", timeout=5) as r:
            return r.status == 200
    except Exception:
        return False


def main():
    lock = single_instance()
    if lock is None:
        print("the automations are already running")
        return 0
    # Vikunja starts at the same time as this task: wait for it (up to 10 min) so a PC start-up
    # does not leave "server unreachable" errors behind.
    for _ in range(120):
        if server_answers(SETTINGS["VIKUNJA_URL"]):
            break
        time.sleep(5)
    accounts = {}  # name -> {"env", "proc", "pause", "started", "next"}
    last_scan = 0
    last_reminders = 0
    while True:
        now = time.time()
        # Task reminders on the phone (19 Nov 2026), every minute, for every account: see reminders.py.
        if now - last_reminders >= 60:
            last_reminders = now
            try:
                reminders.check(ROOT, log=log)
            except Exception as e:  # noqa: BLE001
                log(f"reminders: {e}")
        if now - last_scan > 30:
            last_scan = now
            wanted = account_settings()
            for name in list(accounts):
                if name not in wanted:
                    stop(accounts.pop(name), name)
            for name, settings in wanted.items():
                if name not in accounts:
                    accounts[name] = {"env": dict(os.environ, **settings), "proc": None, "pause": 5, "started": 0, "next": 0}
        for name, a in accounts.items():
            p = a["proc"]
            if p is not None and p.poll() is None:
                continue
            if p is not None:  # it stopped
                code, ran = p.returncode, time.time() - a["started"]
                a["proc"] = None
                if code == 0:
                    a["pause"] = 5  # a normal restart (new code)
                else:
                    a["pause"] = 5 if ran > 600 else min(a["pause"] * 2, 300)
                    log(f"[{name}] webhook_listener.py stopped with code {code} after {int(ran)} s: starting it again in {a['pause']} s")
                a["next"] = time.time() + a["pause"]
            if time.time() >= a["next"]:
                log(f"[{name}] starting webhook_listener.py")
                a["started"] = time.time()
                a["proc"] = subprocess.Popen(
                    [sys.executable, "-X", "utf8", "-I", os.path.join(HERE, "webhook_listener.py")],
                    cwd=HERE, env=a["env"],
                    creationflags=0x08000000 if sys.platform == "win32" else 0,  # no console window
                )
        time.sleep(2)


USERS_DIR = os.path.join(STATE_DIR, "users")


def account_settings():
    """Your account (always) plus every account with a token in state/automations/users/<name>/."""
    out = {"main": SETTINGS}
    try:
        names = sorted(os.listdir(USERS_DIR))
    except OSError:
        names = []
    for name in names:
        d = os.path.join(USERS_DIR, name)
        if not os.path.isfile(os.path.join(d, "api_token.txt")):
            continue
        out[name] = dict(SETTINGS, AUTOMATION_STATE_DIR=d, VIKUNJA_TOKEN_FILE=os.path.join(d, "api_token.txt"),
                         AUTOMATION_LOG=os.path.join(ROOT, "logs", f"automations-{name}.log"))
    return out


def stop(a, name):
    p = a.get("proc")
    if p is not None and p.poll() is None:
        log(f"[{name}] automations switched off: stopping its poller")
        p.terminate()
        try:
            p.wait(10)
        except Exception:  # noqa: BLE001
            p.kill()


if __name__ == "__main__":
    sys.exit(main())
