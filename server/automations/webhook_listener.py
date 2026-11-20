#!/usr/bin/env python3
import json
import time
import os
import sys
import shutil
import subprocess
import traceback
import urllib.request
import urllib.error
import urllib.parse
import re
from datetime import datetime, timezone, date, timedelta

# folder_sync sits next to this file; Python started with -I does not add this folder by itself.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# One file for both machines (10 Oct 2026). What runs where is set by the ROLE:
#   server   the label / project / date automations: runs on the PC, next to Vikunja (24/7)
#   folders  the project-folder mirror and the weekly report: runs on the Mac (the folders are there)
#   all      both, as before the split
# Never run "server" (or "all") on two machines at once: they would race on labels and dates.
# Role: --role, else AUTOMATION_ROLE, else poller_role.txt next to the state files, else "all".
# On the PC every setting comes from run_poller.py; on the Mac the defaults below apply.

# The server lives on the always-on Windows PC (Tailscale Funnel address; the PC itself uses 127.0.0.1).
VIKUNJA_URL = os.environ.get("VIKUNJA_URL", "https://pc-lou.tailc45f62.ts.net")
# The API token ("Full Access") is read from a file, never written in the code:
#   VIKUNJA_TOKEN (environment), else VIKUNJA_TOKEN_FILE, else api_token.txt next to the state files.
NEXT_ACTION_LABEL_ID = 4
TODAY_LABEL_ID = 5
OVERDUE_LABEL_ID = 112
LAST_DAY_LABEL_ID = 113
PROTECTED_LABEL_IDS = {NEXT_ACTION_LABEL_ID, TODAY_LABEL_ID, OVERDUE_LABEL_ID, LAST_DAY_LABEL_ID}
# Since 26 Oct 2026 the automations run for every account that turns them on, each with its own
# labels: the ids above are only the starting values (Lou's account); every poller looks its
# account's four labels up by name (creating any that is missing) before working.
AUTOMATION_LABELS = (("next-action", "5f5ff6"), ("today", "000000"), ("overdue", "ff473d"), ("last-day", "ffab40"))
LABELS_RESOLVED = False
P1_LABEL_COLOR = "ff473d"
LAST_DAY_LABEL_COLOR = "ffab40"

EXCLUDED_PROJECT_TITLES = {"INBOX", "SINGLE TASKS", "Bin"}
BIN_PROJECT_TITLE = "Bin"  # deleted tasks wait here for 30 days (the app owns it)
BIN_IDS = set()  # refreshed every poll by get_projects_and_pending
PENDING_PROJECT_TITLE = "PENDING"
PENDING_FILTER_CLAUSE_RE = re.compile(r"\s*&&\s*\(project_id not in [0-9,]+\)\s*$")
ZERO_DATE = "0001-01-01T00:00:00Z"

POLL_INTERVAL_SECONDS = 60
WEEKLY_INTERVAL_DAYS = 7
DAILY_INTERVAL_DAYS = 1

BASE_DIR = os.environ.get("AUTOMATION_DIR", os.path.dirname(os.path.abspath(__file__)))
STATE_DIR = os.environ.get("AUTOMATION_STATE_DIR", BASE_DIR)  # the PC keeps state apart from the code
STATE_FILE = os.path.join(STATE_DIR, "last_check.txt")
WEEKLY_STATE_FILE = os.path.join(STATE_DIR, "weekly_last_run.txt")
DAILY_STATE_FILE = os.path.join(STATE_DIR, "daily_last_run.txt")
PENDING_TASK_IDS_STATE_FILE = os.path.join(STATE_DIR, "pending_task_ids_last.txt")
ROLE_FILE = os.path.join(STATE_DIR, "poller_role.txt")
TOKEN_FILE = os.environ.get("VIKUNJA_TOKEN_FILE", os.path.join(STATE_DIR, "api_token.txt"))
AREAS_DIR = os.environ.get("VIKUNJA_AREAS_DIR", "/Users/loudodin/Partage_One_plus_nord_CE_2/areas")
LOG_FILE = os.environ.get("AUTOMATION_LOG", "/tmp/vikunja_automation.log")
LOG_MAX_BYTES = 20 * 1024 * 1024  # then the log becomes <log>.old and a new one starts
ERRORS_LOG_FILE = os.path.join(STATE_DIR, "errors.log")
NOTIFY_STATE_FILE = os.path.join(STATE_DIR, "notify_last_sent.json")
NOTIFY_COOLDOWN_SECONDS = 30 * 60  # don't re-notify the SAME problem more than once per 30 min
HEARTBEAT_FILE = os.path.join(STATE_DIR, "heartbeat.txt")  # written every cycle, checked by the watchdog / health check
ROLES = ("server", "folders", "all")
ROLE_OVERRIDE = None  # set by --role
ERROR_COUNT = 0  # problems reported since start (used by --once)

_label_cache = {}


def log(msg):
    try:
        if os.path.getsize(LOG_FILE) > LOG_MAX_BYTES:
            os.replace(LOG_FILE, LOG_FILE + ".old")
    except OSError:
        pass
    try:
        os.makedirs(os.path.dirname(LOG_FILE) or ".", exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"{datetime.now().isoformat()} {msg}\n")
    except OSError:
        pass  # logging must never stop an automation


def get_token():
    token = os.environ.get("VIKUNJA_TOKEN", "").strip()
    if token:
        return token
    try:
        with open(TOKEN_FILE, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        raise RuntimeError(f"no API token: put it in {TOKEN_FILE}")


def current_role():
    if ROLE_OVERRIDE:
        return ROLE_OVERRIDE
    role = os.environ.get("AUTOMATION_ROLE", "").strip().lower()
    if not role:
        role = read_state(ROLE_FILE, "all").strip().lower()
    if role not in ROLES:
        notify_error("role", f"unknown role '{role}' (expected {', '.join(ROLES)}): running nothing")
        return None
    return role


# ---- error notification: the single path every pipeline failure goes
# through, so nothing fails silently. See #12 in the README for the design.

def _mac_notify(title, message):
    """Best-effort native macOS notification (the Mac only: on the PC, errors.log feeds the
    hourly health check, which notifies on Windows, in the app and on the phone). Wrapped so a notification
    failure (osascript missing, Do Not Disturb, whatever) can never itself
    take down the automation — this must never raise."""
    if sys.platform != "darwin":
        return
    try:
        def esc(s):
            return s.replace("\\", "\\\\").replace('"', '\\"')
        script = f'display notification "{esc(message)[:250]}" with title "{esc(title)}" sound name "Basso"'
        subprocess.run(
            ["osascript", "-e", script],
            timeout=5, check=False,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except Exception:
        pass


def _load_notify_state():
    try:
        with open(NOTIFY_STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_notify_state(state):
    try:
        os.makedirs(os.path.dirname(NOTIFY_STATE_FILE), exist_ok=True)
        with open(NOTIFY_STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f)
    except OSError:
        pass


def notify_error(source, message):
    """Call this — not log() — for anything that represents a real
    problem in a pipeline (not routine activity). Always: (1) logs full
    detail, including a traceback if called from inside an except block,
    to the main log; (2) appends a compact line to errors.log, so
    problems are easy to grep without wading through routine "Created
    folder" noise; (3) fires a native macOS notification — rate-limited
    per distinct (source, message) pair to once every 30 minutes, so a
    persistent problem doesn't spam you but a genuinely NEW problem
    always alerts immediately."""
    global ERROR_COUNT
    ERROR_COUNT += 1
    tb = traceback.format_exc()
    has_tb = tb.strip() != "NoneType: None"
    log(f"ERROR [{source}] {message}" + (f"\n{tb}" if has_tb else ""))

    try:
        os.makedirs(os.path.dirname(ERRORS_LOG_FILE), exist_ok=True)
        if os.path.exists(ERRORS_LOG_FILE) and os.path.getsize(ERRORS_LOG_FILE) > 2 * 1024 * 1024:
            os.replace(ERRORS_LOG_FILE, ERRORS_LOG_FILE + ".old")
        with open(ERRORS_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"{datetime.now().isoformat()} [{source}] {message}\n")
    except OSError:
        pass

    key = f"{source}:{message}"[:300]
    state = _load_notify_state()
    last = state.get(key)
    now_ts = time.time()
    if last is not None and (now_ts - last) < NOTIFY_COOLDOWN_SECONDS:
        return  # already notified about this exact problem recently
    state[key] = now_ts
    _save_notify_state(state)
    _mac_notify("Vikunja automation error", f"{source}: {message}")


def run_step(name, fn):
    """Runs one pipeline step in isolation: a failure here is reported via
    notify_error and swallowed so it can never cascade into skipping the
    OTHER, unrelated steps later in the same poll — see the README's
    notification-design section for why this matters."""
    try:
        fn()
    except Exception as e:
        notify_error(name, str(e))


def now_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def api_request(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        VIKUNJA_URL + path,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {get_token()}",
            "Content-Type": "application/json",
        },
    )
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
                return json.loads(body) if body else None
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            log(f"HTTPError on {method} {path}: {e.code} {body}")
            # A server error (e.g. SQLite busy for a moment while the app syncs) is tried once more.
            if e.code < 500 or attempt == 2:
                raise
        time.sleep(2)


def api_get(path):
    return api_request("GET", path)


def get_task(task_id):
    return api_get(f"/api/v1/tasks/{task_id}")


# Vikunja's update replaces the WHOLE object: a field left out is emptied (26 Oct 2026: setting
# only a start date wiped the task's due date, notes and priority; moving a project with only its
# new parent was refused for lack of a title). So an update always sends the current values, with
# the change on top, like the app does.
TASK_FIELDS = ("title", "description", "done", "due_date", "start_date", "end_date", "priority", "percent_done",
               "repeat_after", "repeat_mode", "hex_color", "is_favorite", "project_id", "done_at",
               # Vikunja clears what a full update leaves out: the reminders too (19 Nov 2026).
               "reminders")
PROJECT_FIELDS = ("title", "description", "identifier", "hex_color", "parent_project_id", "is_archived", "position", "is_favorite")


def update_task(task_id, fields):
    current = get_task(task_id) or {}
    payload = {k: current[k] for k in TASK_FIELDS if k in current}
    payload.update(fields)
    return api_request("POST", f"/api/v1/tasks/{task_id}", payload)


def update_project(project_id, fields):
    current = api_get(f"/api/v1/projects/{project_id}") or {}
    payload = {k: current[k] for k in PROJECT_FIELDS if k in current}
    payload.update(fields)
    return api_request("POST", f"/api/v1/projects/{project_id}", payload)


def add_label_to_task(task_id, label_id):
    return api_request("PUT", f"/api/v1/tasks/{task_id}/labels", {"label_id": label_id})


def remove_label_from_task(task_id, label_id):
    try:
        return api_request("DELETE", f"/api/v1/tasks/{task_id}/labels/{label_id}")
    except urllib.error.HTTPError as e:
        if e.code != 404:  # 404 just means it's already gone — fine, not an error
            notify_error("remove label from task", f"task {task_id}, label {label_id}: HTTP {e.code}")


def delete_label(label_id):
    try:
        return api_request("DELETE", f"/api/v1/labels/{label_id}")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            notify_error("delete label", f"label {label_id}: HTTP {e.code}")


def get_all_labels():
    page = 1
    results = []
    while True:
        batch = api_get(f"/api/v1/labels?page={page}&per_page=50")
        if not batch:
            break
        results.extend(batch)
        if len(batch) < 50:
            break
        page += 1
    return results


def get_or_create_label(name, hex_color):
    if name in _label_cache:
        return _label_cache[name]
    labels = get_all_labels()
    for l in labels:
        if l["title"] == name:
            _label_cache[name] = l["id"]
            return l["id"]
    created = api_request("PUT", "/api/v1/labels", {"title": name, "hex_color": hex_color})
    log(f"Created missing label '{name}' (id {created['id']})")
    _label_cache[name] = created["id"]
    return created["id"]


def resolve_automation_labels():
    """Finds this account's next-action / today / overdue / last-day labels by name (the oldest
    one when a name is used twice), creates the missing ones, and points the automations at them."""
    global NEXT_ACTION_LABEL_ID, TODAY_LABEL_ID, OVERDUE_LABEL_ID, LAST_DAY_LABEL_ID, PROTECTED_LABEL_IDS, LABELS_RESOLVED
    labels = get_all_labels()
    ids = {}
    for name, color in AUTOMATION_LABELS:
        same = sorted(l["id"] for l in labels if (l.get("title") or "").strip().lower() == name)
        if same:
            ids[name] = same[0]
        else:
            created = api_request("PUT", "/api/v1/labels", {"title": name, "hex_color": color})
            log(f"Created the automation label '{name}' (id {created['id']})")
            ids[name] = created["id"]
    NEXT_ACTION_LABEL_ID, TODAY_LABEL_ID = ids["next-action"], ids["today"]
    OVERDUE_LABEL_ID, LAST_DAY_LABEL_ID = ids["overdue"], ids["last-day"]
    PROTECTED_LABEL_IDS = set(ids.values())
    LABELS_RESOLVED = True
    return ids


_META_LINE_RE = re.compile(r"^[ \t]*\[(?:pending|start:\d{4}-\d{2}-\d{2}|end:\d{4}-\d{2}-\d{2}|ctx:(?:pro|perso))\][ \t]*(?:\r?\n|$)", re.I)


def description_marks_pending(description):
    """True when the app flagged the project as pending with a hidden first line "[pending]"
    (other hidden lines such as [ctx:pro] may come before it)."""
    rest = description or ""
    for _ in range(8):
        m = _META_LINE_RE.match(rest)
        if not m:
            return False
        if m.group(0).strip().lower() == "[pending]":
            return True
        rest = rest[m.end():]
    return False


def get_projects_and_pending():
    """Returns (projects, pending_root_id_or_None, pending_ids). pending_ids covers
    the old PENDING project and everything nested under it, every project the app flagged
    "[pending]" (and what is nested under those), and the Bin. Recomputed fresh each poll so a
    change takes effect on the very next cycle (~60s), without needing a restart."""
    global BIN_IDS
    projects = api_get("/api/v1/projects")
    root = next((p for p in projects if p["title"] == PENDING_PROJECT_TITLE), None)
    pending_ids = {root["id"]} if root else set()
    for p in projects:
        if p["id"] > 0 and description_marks_pending(p.get("description")):
            pending_ids.add(p["id"])
    BIN_IDS = {p["id"] for p in projects if p["id"] > 0 and p["title"] == BIN_PROJECT_TITLE and not p.get("parent_project_id")}
    pending_ids |= BIN_IDS
    changed = True
    while changed:
        changed = False
        for p in projects:
            if p.get("parent_project_id") in pending_ids and p["id"] not in pending_ids:
                pending_ids.add(p["id"])
                changed = True
    return projects, (root["id"] if root else None), pending_ids


def get_pending_project_ids():
    """Thin wrapper for callers (the weekly report) that only need the id set."""
    return get_projects_and_pending()[2]

def paginated_tasks(filter_str=None, per_page=50):
    page = 1
    results = []
    while True:
        params = [("sort_by[]", "id"), ("order_by[]", "asc"), ("page", str(page)), ("per_page", str(per_page))]
        if filter_str:
            params.append(("filter", filter_str))
        query = urllib.parse.urlencode(params)
        batch = api_get(f"/api/v1/tasks?{query}")
        if not batch:
            break
        results.extend(batch)
        if len(batch) < per_page:
            break
        page += 1
    return results


def read_state(path, default):
    """A state file damaged by a sudden power cut or crash (Windows can leave it full of zero
    bytes: it happened on 10 Oct 2026) counts as missing, instead of failing every minute."""
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            content = f.read().strip()
    except (FileNotFoundError, NotADirectoryError):
        return default
    if "\x00" in content or "\ufffd" in content:
        log(f"State file {os.path.basename(path)} was damaged (sudden restart?): starting it again")
        return default
    return content or default


def write_state(path, value):
    """Written to a temporary file first, then swapped in: a reader never sees half a file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(value)
        f.flush()
        os.fsync(f.fileno())  # on disk before the swap: a power cut cannot leave an empty file
    os.replace(tmp, path)


def to_local_date(iso_str):
    dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    return dt.astimezone().date()


def is_zero_date(iso_str):
    return iso_str.startswith("0001-01-01")


# ---- Label cleanup + successor next-action logic ----

def clear_stale_labels(task):
    label_ids = {l["id"] for l in (task.get("labels") or [])}
    for lid in (NEXT_ACTION_LABEL_ID, TODAY_LABEL_ID, OVERDUE_LABEL_ID, LAST_DAY_LABEL_ID):
        if lid in label_ids:
            remove_label_from_task(task["id"], lid)
            log(f"Removed label {lid} from completed task {task['id']}")


def process_newly_done_task(task, pending_ids):
    log(f"Task {task['id']} ({task.get('title')}) is done, cleaning up + checking successors")
    clear_stale_labels(task)

    successors = (task.get("related_tasks") or {}).get("precedes") or []
    for succ_stub in successors:
        succ_id = succ_stub["id"]
        try:
            succ_task = get_task(succ_id)

            if succ_task.get("project_id") in pending_ids:
                continue  # still in PENDING — don't surface it with an auto-label yet

            predecessors = (succ_task.get("related_tasks") or {}).get("follows") or []
            if not predecessors:
                continue

            all_done = all(p.get("done") for p in predecessors)
            if not all_done:
                continue

            existing_label_ids = [l["id"] for l in (succ_task.get("labels") or [])]
            if NEXT_ACTION_LABEL_ID in existing_label_ids:
                continue

            add_label_to_task(succ_id, NEXT_ACTION_LABEL_ID)
            log(f"Added next-action label to task {succ_id} ({succ_task.get('title')})")
        except Exception as e:
            # A dangling relation (successor task deleted) or a transient
            # API error here used to abort the WHOLE poll — including
            # unrelated automations later in the same cycle. One bad
            # successor now just gets reported and skipped.
            notify_error("successor next-action check", f"task {task['id']} -> successor {succ_id}: {e}")


# ---- start_date backfill ----

def backfill_start_dates(since_str, pending_ids):
    filt = f"created > {since_str}"
    tasks = paginated_tasks(filt)
    for task in tasks:
        if task.get("project_id") in pending_ids:
            continue  # kept dateless on purpose so it can't surface in Today/Tomorrow
        if is_zero_date(task.get("start_date", "")):
            update_task(task["id"], {"start_date": now_str()})
            log(f"Backfilled start_date on task {task['id']} ({task.get('title')})")


# ---- overdue / last-day due-date labels ----

def sync_due_date_labels(pending_ids):
    overdue_id = OVERDUE_LABEL_ID
    last_day_id = LAST_DAY_LABEL_ID
    today = date.today()

    tasks = paginated_tasks("done = false && due_date > 2000-01-01")
    for task in tasks:
        if task.get("project_id") in pending_ids:
            continue  # don't auto-label overdue/last-day while still in PENDING
        due_local = to_local_date(task["due_date"])
        label_ids = {l["id"] for l in (task.get("labels") or [])}
        has_overdue = overdue_id in label_ids
        has_last_day = last_day_id in label_ids

        if due_local < today:
            if not has_overdue:
                add_label_to_task(task["id"], overdue_id)
                log(f"Marked task {task['id']} ({task.get('title')}) overdue")
            if has_last_day:
                remove_label_from_task(task["id"], last_day_id)
        elif due_local == today:
            if not has_last_day:
                add_label_to_task(task["id"], last_day_id)
                log(f"Marked task {task['id']} ({task.get('title')}) as last-day")
            if has_overdue:
                remove_label_from_task(task["id"], overdue_id)
        else:
            if has_overdue:
                remove_label_from_task(task["id"], overdue_id)
            if has_last_day:
                remove_label_from_task(task["id"], last_day_id)


# ---- daily label maintenance: merge duplicates, delete unused ----

def merge_label_duplicates(labels, tasks):
    by_title = {}
    for l in labels:
        by_title.setdefault(l["title"], []).append(l)

    for title, group in by_title.items():
        if len(group) <= 1:
            continue

        protected_in_group = [l for l in group if l["id"] in PROTECTED_LABEL_IDS]
        keeper = protected_in_group[0] if protected_in_group else min(group, key=lambda l: l["id"])

        for l in group:
            if l["id"] == keeper["id"]:
                continue
            if l["id"] in PROTECTED_LABEL_IDS:
                continue  # never touch a protected label, even as a non-keeper
            affected = [t for t in tasks if any(x["id"] == l["id"] for x in (t.get("labels") or []))]
            for t in affected:
                has_keeper = any(x["id"] == keeper["id"] for x in (t.get("labels") or []))
                if not has_keeper:
                    add_label_to_task(t["id"], keeper["id"])
            delete_label(l["id"])
            log(f"Merged duplicate label '{title}' (id {l['id']}) into id {keeper['id']} ({len(affected)} tasks reassigned)")


def delete_unused_labels(labels, tasks):
    used_ids = set()
    for t in tasks:
        for l in (t.get("labels") or []):
            used_ids.add(l["id"])

    for l in labels:
        if l["id"] in PROTECTED_LABEL_IDS:
            continue
        if l["id"] not in used_ids:
            delete_label(l["id"])
            log(f"Deleted unused label '{l['title']}' (id {l['id']})")


def run_daily_checks():
    log("Running daily checks (duplicate label merge)")
    labels = get_all_labels()
    tasks = paginated_tasks()
    merge_label_duplicates(labels, tasks)
    # delete_unused_labels() is intentionally NOT called here any more:
    # disabled 2026-09-20 after it deleted 60 intentionally-kept-but-unused
    # labels in one run. The function is left below in case a safer,
    # opt-in version is wanted later (e.g. only after N days unused).


def daily_checks_due():
    last_run = read_state(DAILY_STATE_FILE, None)
    if last_run is None:
        return True
    last_date = date.fromisoformat(last_run)
    return (date.today() - last_date).days >= DAILY_INTERVAL_DAYS



# ---- clear reached start_dates for tasks newly part of PENDING ----
# Task-level, not project-level: catches a whole project being dragged in,
# a single task being moved into a project already inside PENDING, and a
# brand new task created there with a backdated start_date — anything that
# could otherwise trigger an immediate, unwanted #8 graduation.

def read_pending_task_ids_state():
    """The pending tasks seen last time, or None when that is unknown (file missing or damaged)."""
    raw = read_state(PENDING_TASK_IDS_STATE_FILE, None)
    if raw is None:
        return None
    try:
        return {int(x) for x in raw.split(",") if x.strip() and x.strip() != "none"}
    except ValueError:
        log("pending_task_ids_last.txt unreadable: starting it again")
        return None


def write_pending_task_ids_state(ids):
    # "none" rather than an empty file: an empty file would read as "unknown".
    write_state(PENDING_TASK_IDS_STATE_FILE, ",".join(str(i) for i in sorted(ids)) or "none")


def clear_reached_start_dates_for_new_pending_tasks(pending_ids, all_tasks, previous_pending_task_ids):
    """Any task that is part of a PENDING-tree project now, but wasn't
    tracked as such last poll (new task, moved task, or its whole project
    just moved in) gets its start_date cleared if that date has already
    arrived. A future start_date is left alone — that's the deliberate
    "resume on this date" signal #8 watches for. Returns the current set
    of pending task ids, to persist for next poll's comparison."""
    today = date.today()
    current_pending_task_ids = set()
    for t in all_tasks:
        if t.get("project_id") not in pending_ids:
            continue
        current_pending_task_ids.add(t["id"])
        if t.get("project_id") in BIN_IDS:
            continue  # deleted tasks keep their dates, so a restored task comes back as it was
        if t["id"] in previous_pending_task_ids:
            continue  # already tracked as pending — not new, leave it alone
        sd = t.get("start_date", "")
        if is_zero_date(sd):
            continue
        if to_local_date(sd) <= today:
            update_task(t["id"], {"start_date": ZERO_DATE})
            log(f"Cleared start_date on task {t['id']} ({t.get('title')}) — newly part of PENDING (project {t['project_id']}) with a start_date already in the past/today")
    return current_pending_task_ids



# ---- saved-filter PENDING exclusion sync ----

def get_saved_filter_ids():
    """Every saved filter's own (positive) id, discovered from the pseudo-
    projects Vikunja represents them as (negative project id N -> filter id
    -N - 1). Dynamic on purpose: picks up filters you add/rename/remove
    without needing this script to know their names."""
    projects = api_get("/api/v1/projects")
    return [-p["id"] - 1 for p in projects if p["id"] < 0]


def sync_saved_filters(pending_ids):
    ids_str = ",".join(str(i) for i in sorted(pending_ids)) if pending_ids else ""

    for filter_id in get_saved_filter_ids():
        try:
            current = api_get(f"/api/v1/filters/{filter_id}")
        except urllib.error.HTTPError as e:
            notify_error("saved-filter sync", f"could not fetch filter {filter_id}: HTTP {e.code}")
            continue
        if not current or not current.get("filters"):
            continue

        base = PENDING_FILTER_CLAUSE_RE.sub("", current["filters"]["filter"] or "")

        if ids_str:
            new_filter = f"{base} && (project_id not in {ids_str})" if base else f"project_id not in {ids_str}"
        else:
            new_filter = base  # nothing pending right now — clause removed entirely

        if new_filter == current["filters"]["filter"]:
            continue  # already correct, don't write for no reason

        updated_filters = dict(current["filters"])
        updated_filters["filter"] = new_filter

        payload = {
            "title": current["title"],
            "description": current.get("description", ""),
            "is_favorite": current.get("is_favorite", False),
            "filters": updated_filters,
        }
        api_request("POST", f"/api/v1/filters/{filter_id}", payload)
        log(f"Synced PENDING-exclusion clause on saved filter '{current['title']}' (id {filter_id})")



# ---- PENDING project graduation ----

def path_from_pending_root(project_id, projects_by_id, pending_root_id):
    """Ancestor titles between PENDING and this project's immediate parent,
    nearest-parent last. Empty list means the project is a direct child of
    PENDING itself (i.e. should graduate to a top-level real project)."""
    path = []
    current = projects_by_id.get(project_id)
    if current is None:
        return None
    parent_id = current.get("parent_project_id")
    while parent_id is not None and parent_id != pending_root_id:
        parent = projects_by_id.get(parent_id)
        if parent is None:
            return None  # broken chain — bail out rather than guess
        path.append(parent["title"])
        parent_id = parent.get("parent_project_id")
    path.reverse()
    return path


def resolve_real_parent(path, projects, pending_ids):
    """Walk `path` (list of titles, root-first) through the NON-pending
    project tree. Returns (True, parent_id) if every segment resolves
    (parent_id 0 = attach at top level), or (False, None) if any segment
    isn't found yet — the caller should leave the project where it is."""
    parent_id = 0
    for title in path:
        match = next(
            (p for p in projects
             if p["title"] == title
             and p.get("parent_project_id") == parent_id
             and p["id"] not in pending_ids),
            None,
        )
        if match is None:
            return False, None
        parent_id = match["id"]
    return True, parent_id


def run_pending_graduation(projects, pending_root_id, pending_ids, all_tasks):
    if pending_root_id is None:
        return
    projects_by_id = {p["id"]: p for p in projects}
    today = date.today()

    tasks_by_project = {}
    for t in all_tasks:
        tasks_by_project.setdefault(t["project_id"], []).append(t)

    for pid in list(pending_ids):
        if pid == pending_root_id:
            continue
        project = projects_by_id.get(pid)
        if project is None:
            continue

        try:
            reached = [
                t for t in tasks_by_project.get(pid, [])
                if not t.get("done")
                and not is_zero_date(t.get("start_date", ""))
                and to_local_date(t["start_date"]) <= today
            ]
            if not reached:
                continue

            for t in reached:
                label_ids = {l["id"] for l in (t.get("labels") or [])}
                if NEXT_ACTION_LABEL_ID not in label_ids:
                    add_label_to_task(t["id"], NEXT_ACTION_LABEL_ID)
                    log(f"Task {t['id']} ({t.get('title')}) reached its start_date — labeled next-action (still in PENDING project {pid})")

            path = path_from_pending_root(pid, projects_by_id, pending_root_id)
            if path is None:
                notify_error("PENDING graduation", f"project {pid} ({project['title']}) ready to graduate but its PENDING ancestry looks broken — skipped")
                continue

            resolved, target_parent_id = resolve_real_parent(path, projects, pending_ids)
            if not resolved:
                log(f"Project {pid} ({project['title']}) ready to graduate (path {path}) but no matching real project found yet — left in PENDING. Create the matching real parent project(s) first.")
                continue

            update_project(pid, {"parent_project_id": target_parent_id})
            log(f"Graduated project {pid} ({project['title']}) out of PENDING to real parent {target_parent_id}")
        except Exception as e:
            # One project with bad data must not stop the rest of the
            # PENDING tree from being checked for graduation.
            notify_error("PENDING graduation", f"project {pid} ({project.get('title')}): {e}")



# ---- mirror Vikunja projects as local folders ----
# The layout (areas/<AREA>/<date>_<project>, pending_projects, archived_projects) and all the
# rules live in folder_sync.py, which never deletes or overwrites anything.

def all_projects_including_archived():
    out, page = [], 1
    while True:
        batch = api_get(f"/api/v1/projects?is_archived=true&page={page}&per_page=50")
        if not batch:
            break
        out.extend(batch)
        if len(batch) < 50:
            break
        page += 1
    return out


def sync_area_folders():
    import folder_sync
    projects = [p for p in all_projects_including_archived() if p["id"] > 0]
    folder_sync.Sync(AREAS_DIR, os.path.join(STATE_DIR, "folder_state.json"), log=log, notify=notify_error).run(projects)




# ---- weekly next-action coverage report ----

def build_next_action_report(all_tasks, pending_ids):
    projects = api_get("/api/v1/projects")
    real_projects = [
        p for p in projects
        if p["id"] > 0
        and not p.get("is_archived")
        and p["title"] not in EXCLUDED_PROJECT_TITLES
        and p["id"] not in pending_ids
    ]

    projects_with_any_task = {t["project_id"] for t in all_tasks}
    projects_with_active_next_action = {
        t["project_id"] for t in all_tasks
        if not t.get("done") and any(l["id"] == NEXT_ACTION_LABEL_ID for l in (t.get("labels") or []))
    }

    missing = []
    for p in real_projects:
        if p["id"] not in projects_with_any_task:
            continue  # pure container/parent project with no tasks of its own, skip
        if p["id"] not in projects_with_active_next_action:
            missing.append(p)

    lines = ["Projects with no active next-action task:", ""]
    if missing:
        for p in missing:
            lines.append(f"- {p['title']}")
    else:
        lines.append("(none — every project with tasks has at least one next-action)")
    return "\n".join(lines)


# ---- relation integrity check ----

def build_relation_report(all_tasks, pending_ids):
    by_id = {t["id"]: t for t in all_tasks}
    reportable = [t for t in all_tasks if t.get("project_id") not in pending_ids]

    lines = ["", "Relation integrity check:", ""]
    problems_found = False

    def get_precedes(task):
        rt = task.get("related_tasks") or {}
        return [s["id"] for s in (rt.get("precedes") or [])]

    for t in reportable:
        for succ_id in get_precedes(t):
            if succ_id not in by_id:
                lines.append(f"- Dangling relation: task {t['id']} ({t.get('title')}) precedes missing task {succ_id}")
                problems_found = True

    visited = set()
    stack = set()

    def dfs(node_id, path):
        nonlocal problems_found
        if node_id in stack:
            cycle = " -> ".join(str(n) for n in path + [node_id])
            lines.append(f"- Cycle detected: {cycle}")
            problems_found = True
            return
        if node_id in visited or node_id not in by_id:
            return
        visited.add(node_id)
        stack.add(node_id)
        for succ_id in get_precedes(by_id[node_id]):
            dfs(succ_id, path + [node_id])
        stack.discard(node_id)

    for t in reportable:
        if t["id"] not in visited:
            dfs(t["id"], [])

    if not problems_found:
        lines.append("(no cycles or dangling relations found)")

    return "\n".join(lines)


def run_weekly_checks(pending_ids):
    log("Running weekly checks (next-action coverage + relation integrity)")
    all_tasks = paginated_tasks()
    report = build_next_action_report(all_tasks, pending_ids) + "\n" + build_relation_report(all_tasks, pending_ids)
    os.makedirs(AREAS_DIR, exist_ok=True)
    filename = f"{AREAS_DIR}/report_{date.today().isoformat()}.txt"
    with open(filename, "w", encoding="utf-8") as f:
        f.write(report)
    log(f"Weekly report written to {filename}")


def weekly_checks_due():
    last_run = read_state(WEEKLY_STATE_FILE, None)
    if last_run is None:
        return True
    last_date = date.fromisoformat(last_run)
    return (date.today() - last_date).days >= WEEKLY_INTERVAL_DAYS


# ---- Main poll cycle ----

def poll_once():
    """Each step below is isolated: a failure in ANY one of them is
    reported via notify_error and does not stop the others from running.
    This used to be one big try/except around the whole poll, which meant
    a single bad task (e.g. a dangling relation to a deleted task) could
    silently skip filter sync, due-date labels, and PENDING graduation
    for that entire cycle — see the change log entry for 2026-09-20
    (x12) for the incident that prompted this.

    Which steps run depends on the role (see the top of this file)."""
    role = current_role()
    if role is None:
        return
    labels_and_dates = role in ("server", "all")
    folders = role in ("folders", "all")
    if labels_and_dates and not LABELS_RESOLVED:
        try:
            resolve_automation_labels()
        except Exception as e:  # noqa: BLE001
            # Without its own labels this account's label steps must not run (they would use
            # another account's ids): retried next cycle.
            notify_error("automation labels", f"cannot find or create them: {e}")
            labels_and_dates = False

    since = read_state(STATE_FILE, now_str())
    now = now_str()
    if not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", since):
        since = now
    # Vikunja compares times to the second: a task changed in the same second as the previous
    # cycle started would be missed by "updated > since". Looking 2 minutes further back costs
    # nothing (every step below is idempotent) and closes that gap.
    try:
        since = (datetime.strptime(since, "%Y-%m-%dT%H:%M:%SZ") - timedelta(minutes=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        pass

    try:
        projects, pending_root_id, pending_ids = get_projects_and_pending()
    except Exception as e:
        # Nothing else below can run meaningfully without a project list —
        # report it and retry next cycle. `since` is deliberately NOT
        # advanced here, so the "what's new" window this poll would have
        # covered is picked up again next time instead of being silently
        # skipped.
        notify_error("fetch projects", str(e))
        return

    if folders:
        run_step("project folders", sync_area_folders)

    if labels_and_dates:
        def _clear_reached_start_dates():
            previous_pending_task_ids = read_pending_task_ids_state()
            tasks_snapshot = paginated_tasks()
            if previous_pending_task_ids is None:
                # Unknown last time: take today's pending tasks as the starting point, without
                # touching any date (every one would otherwise look "new" and lose its start date).
                current_pending_task_ids = {t["id"] for t in tasks_snapshot if t.get("project_id") in pending_ids}
                log(f"Pending-task tracking restarted from today's {len(current_pending_task_ids)} pending task(s); no date changed")
            else:
                current_pending_task_ids = clear_reached_start_dates_for_new_pending_tasks(
                    pending_ids, tasks_snapshot, previous_pending_task_ids
                )
            write_pending_task_ids_state(current_pending_task_ids)
        run_step("pending task tracking", _clear_reached_start_dates)

        try:
            newly_done = paginated_tasks(f"done = true && updated > {since}")
        except Exception as e:
            notify_error("fetch newly-done tasks", str(e))
            newly_done = []
        for task in newly_done:
            try:
                process_newly_done_task(task, pending_ids)
            except Exception as e:
                # One task with a problem (e.g. a since-deleted successor)
                # must not stop the OTHER newly-done tasks from being
                # processed.
                notify_error("process completed task", f"task {task.get('id')} ({task.get('title')}): {e}")

        run_step("start_date backfill", lambda: backfill_start_dates(since, pending_ids))
        run_step("due-date labels", lambda: sync_due_date_labels(pending_ids))
        run_step("saved-filter sync", lambda: sync_saved_filters(pending_ids))

        if pending_root_id is not None:
            def _graduate():
                all_tasks_now = paginated_tasks()
                run_pending_graduation(projects, pending_root_id, pending_ids, all_tasks_now)
            run_step("PENDING graduation", _graduate)

        # Advance the checkpoint once the project list and the newly-done pass
        # were at least attempted — each step above already protects its own
        # retry logic (or is naturally idempotent), so a downstream hiccup
        # shouldn't make `since` fall permanently behind and the "what
        # changed" window grow without bound on every future poll.
        write_state(STATE_FILE, now)

    if folders:
        run_step("weekly checks", lambda: _run_weekly_checks_if_due())
    if labels_and_dates:
        run_step("daily checks", lambda: _run_daily_checks_if_due())


def _run_weekly_checks_if_due():
    if weekly_checks_due():
        run_weekly_checks(get_pending_project_ids())
        write_state(WEEKLY_STATE_FILE, date.today().isoformat())


def _run_daily_checks_if_due():
    if daily_checks_due():
        run_daily_checks()
        write_state(DAILY_STATE_FILE, date.today().isoformat())


def _code_stamp():
    here = os.path.dirname(os.path.abspath(__file__))
    out = []
    for name in ("webhook_listener.py", "folder_sync.py"):
        try:
            out.append(os.stat(os.path.join(here, name)).st_mtime)
        except OSError:
            out.append(0)
    return tuple(out)


def preflight():
    """Read-only start-up check (--check): the server answers, the token works, and the labels
    the automations depend on exist with the expected ids. Returns a list of problems."""
    problems = []
    try:
        get_token()
    except RuntimeError as e:
        return [str(e)]
    try:
        api_get("/api/v1/projects")
    except Exception as e:
        return [f"the server at {VIKUNJA_URL} refused or did not answer: {e}"]
    # Read-only: the four labels are found by name (a missing one is created by the first cycle).
    try:
        titles = {(l.get("title") or "").strip().lower() for l in get_all_labels()}
        missing = [n for n, _ in AUTOMATION_LABELS if n not in titles]
        if missing:
            print("NOTE  missing label(s), created at the first cycle: " + ", ".join(missing))
    except Exception as e:
        problems.append(f"the labels cannot be read: {e}")
    return problems


def main(argv):
    global ROLE_OVERRIDE
    if "--role" in argv:
        ROLE_OVERRIDE = argv[argv.index("--role") + 1].strip().lower()
        if ROLE_OVERRIDE not in ROLES:
            print(f"unknown role {ROLE_OVERRIDE}: use one of {', '.join(ROLES)}")
            return 2
    if "--check" in argv:
        problems = preflight()
        for p in problems:
            print("PROBLEM", p)
        if not problems:
            print(f"OK  server {VIKUNJA_URL} answers, the token works, the labels can be read")
        return 1 if problems else 0
    if "--once" in argv:
        # One full cycle, then exit 1 if any step reported a problem (used by tests and by
        # update-vikunja on a copy of the data).
        log(f"One cycle (role {current_role()}, server {VIKUNJA_URL})")
        poll_once()
        write_state(HEARTBEAT_FILE, now_str())
        print(f"{ERROR_COUNT} problem(s) during the cycle" + (f": see {ERRORS_LOG_FILE}" if ERROR_COUNT else ""))
        return 1 if ERROR_COUNT else 0

    log(f"Starting poller (role {current_role()}, server {VIKUNJA_URL})")
    boot_stamp = _code_stamp()
    try:
        write_state(os.path.join(STATE_DIR, "poller_started.txt"), f"{now_str()} {VIKUNJA_URL}")
    except OSError:
        pass
    while True:
        try:
            poll_once()
        except Exception as e:
            # poll_once() is designed to never let an exception escape —
            # every step inside it is individually isolated — so reaching
            # here means something truly unexpected happened (a bug in
            # the isolation itself, for instance). Report it and keep the
            # loop alive rather than letting the whole poller die and go
            # silent — that would be the worst kind of silent failure,
            # since even this script's own log stops updating.
            notify_error("poller top level", f"unexpected: {e}")
        # Written every cycle regardless of what happened above — this is
        # the ONE thing that must never depend on anything going right,
        # since it's the signal the watchdog uses to notice the poller has
        # stopped entirely (a crash loop, the supervisor giving up, this
        # process getting killed) — the one failure mode this script can
        # never report about itself.
        try:
            write_state(HEARTBEAT_FILE, now_str())
        except OSError:
            pass
        # When this script or folder_sync.py was updated, exit: the supervisor (launchd
        # KeepAlive on the Mac, run_poller.py on the PC) starts the new version.
        if _code_stamp() != boot_stamp:
            log("Code changed on disk: restarting to load it")
            return 0
        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
