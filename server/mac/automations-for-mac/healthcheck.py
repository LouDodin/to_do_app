#!/usr/bin/env python3
"""Health checks for the Vikunja setup (data + automation), standalone and read-only.

Why this exists
---------------
watchdog.py only answers one question: "is the poller alive?". It cannot tell you that the
data itself drifted (two labels called the same, a done task still showing `overdue`, a
relation pointing at a deleted task, a database that no longer passes SQLite's own check).
This module checks all of that, in one pass, and reports it as a list of results:

    ok    nothing to do
    info  worth knowing, never alerts (e.g. "3 tasks look like copies: …_2")
    warn  drift that the poller or you should fix; shown in the report
    fail  something is broken; fires one macOS notification (rate-limited)

Two data sources, same checks
-----------------------------
    --api   reads through the HTTP API (what the poller uses; needs the token)
    --db    reads a copy of the SQLite file (works without the server running,
            and is how these checks are tested away from the Mac)

Nothing here ever writes to Vikunja. The only thing it writes is its own report
(healthcheck_last.json), its own state file, and, with --backup, a copy of the database.

Usage
-----
    python3 healthcheck.py --api                 # all checks, human report, exit 1 on fail
    python3 healthcheck.py --db /path/vikunja.db # same, from a database file
    python3 healthcheck.py --api --notify        # also send a macOS notification on fail
    python3 healthcheck.py --backup              # copy the database into backups/ (keeps 14)
    python3 healthcheck.py --api --json          # machine-readable
"""
import argparse
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field, asdict
from datetime import date, datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
    ZoneInfo("Europe/Paris")
except Exception:  # pragma: no cover - Windows has no time-zone database without the tzdata package:
    ZoneInfo = None  # the computer's own time zone is used instead (the PC is on Paris time)

BASE_DIR = os.environ.get("VIKUNJA_AUTOMATION_DIR", os.path.dirname(os.path.abspath(__file__)))
VIKUNJA_URL = os.environ.get("VIKUNJA_URL", "https://pc-lou.tailc45f62.ts.net")
DB_CANDIDATES = [
    os.environ.get("VIKUNJA_DB", ""),
    os.path.expanduser("~/vikunja/db/vikunja.db"),
    os.path.expanduser("~/mnt/vikunja/db/vikunja.db"),
]
STATE_DIR = os.environ.get("AUTOMATION_STATE_DIR", BASE_DIR)
REPORT_FILE = os.path.join(STATE_DIR, "healthcheck_last.json")
STATE_FILE = os.path.join(STATE_DIR, "healthcheck_state.json")
BACKUP_DIR = os.path.join(BASE_DIR, "backups")
HEARTBEAT_FILE = os.path.join(STATE_DIR, "heartbeat.txt")
ERRORS_LOG = os.path.join(STATE_DIR, "errors.log")
POLLER_LOG = os.environ.get("AUTOMATION_LOG", "/tmp/vikunja_automation.log")
TOKEN_FILE = os.environ.get("VIKUNJA_TOKEN_FILE", os.path.join(STATE_DIR, "api_token.txt"))

TIMEZONE = "Europe/Paris"
ZERO_DATE = "0001-01-01"
PROTECTED = {4: "next-action", 5: "today", 112: "overdue", 113: "last-day"}
ACTIVE_LABELS = {"next-action", "today", "overdue", "last-day"}
HEARTBEAT_STALE_SECONDS = 5 * 60
NOTIFY_COOLDOWN_SECONDS = 6 * 3600
BACKUPS_TO_KEEP = 14
MAX_ITEMS = 8  # items listed per result, so a report stays readable


@dataclass
class Result:
    name: str
    level: str  # ok | info | warn | fail
    summary: str
    items: list = field(default_factory=list)


# --------------------------------------------------------------------------- helpers

def norm(s: str) -> str:
    """Same idea as the app's dedupe.norm: case, accents, emoji and extra spaces are ignored,
    symbols are kept (so '<60' and '>60' stay different labels)."""
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = "".join(c for c in s if unicodedata.category(c) not in ("So", "Sk", "Cs", "Cf"))
    return re.sub(r"\s+", " ", s).strip().lower()


def local_today(now=None) -> date:
    now = now or datetime.now(timezone.utc)
    tz = ZoneInfo(TIMEZONE) if ZoneInfo else None
    return now.astimezone(tz).date() if tz else now.astimezone().date()


def parse_dt(value):
    """Vikunja dates as datetime (UTC), or None for empty / zero dates. Accepts the API form
    (2026-10-08T14:50:03Z) and the SQLite form (2026-10-08 14:50:03)."""
    if not value or str(value).startswith(ZERO_DATE):
        return None
    v = str(value).replace("Z", "+00:00").replace(" ", "T")
    try:
        d = datetime.fromisoformat(v)
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def label_ids_by_title(labels):
    out = {}
    for l in labels:
        out.setdefault(norm(l["title"]), []).append(l["id"])
    return out


def listed(items):
    shown = items[:MAX_ITEMS]
    more = len(items) - len(shown)
    return shown + ([f"… and {more} more"] if more > 0 else [])


# --------------------------------------------------------------------------- loaders

def pick_db_path():
    for p in DB_CANDIDATES:
        if p and os.path.exists(p):
            return p
    raise FileNotFoundError("Vikunja database not found (set VIKUNJA_DB)")


def load_sqlite(path):
    """Reads a consistent copy (db + wal) so the live file is never touched."""
    tmp = tempfile.mkdtemp(prefix="hc_")
    try:
        dst = os.path.join(tmp, "v.db")
        shutil.copy(path, dst)
        for ext in ("-wal", "-shm"):
            if os.path.exists(path + ext):
                shutil.copy(path + ext, dst + ext)
        c = sqlite3.connect(dst)
        c.row_factory = sqlite3.Row
        labels_of = {}
        for r in c.execute("select task_id, label_id from label_tasks"):
            labels_of.setdefault(r["task_id"], set()).add(r["label_id"])
        tasks = [
            {
                "id": r["id"], "title": r["title"], "done": bool(r["done"]), "due": r["due_date"],
                "start": r["start_date"], "project_id": r["project_id"], "created": r["created"], "updated": r["updated"],
                "labels": labels_of.get(r["id"], set()),
            }
            for r in c.execute("select * from tasks")
            if not r["deleted_at"] or str(r["deleted_at"]).startswith(ZERO_DATE)
        ]
        labels = [{"id": r["id"], "title": r["title"]} for r in c.execute("select id, title from labels")]
        projects = [
            {"id": r["id"], "title": r["title"], "parent": r["parent_project_id"] or 0,
             "archived": bool(r["is_archived"]), "description": r["description"] or ""}
            for r in c.execute("select * from projects")
        ]
        relations = [(r["task_id"], r["other_task_id"], r["relation_kind"]) for r in c.execute("select * from task_relations")]
        filters = []
        for r in c.execute("select id, title, filters from saved_filters"):
            try:
                f = json.loads(r["filters"]).get("filter", "")
            except (TypeError, ValueError):
                f = ""
            filters.append({"id": r["id"], "title": r["title"], "filter": f})
        c.close()
        return {"tasks": tasks, "labels": labels, "projects": projects, "relations": relations,
                "filters": filters, "source": "db"}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def read_token():
    token = os.environ.get("VIKUNJA_TOKEN")
    if token:
        return token
    try:  # the same token file as the poller
        with open(TOKEN_FILE, encoding="utf-8") as f:
            token = f.read().strip()
            if token:
                return token
    except OSError:
        pass
    try:  # older poller versions held the token in their code
        with open(os.path.join(BASE_DIR, "webhook_listener.py"), encoding="utf-8") as f:
            m = re.search(r'API_TOKEN\s*=\s*"(tk_[0-9a-f]+)"', f.read())
            return m.group(1) if m else None
    except OSError:
        return None


def api_get(path, token):
    req = urllib.request.Request(VIKUNJA_URL + path, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read() or "null")


def paginate(path, token, per_page=50):
    out, page = [], 1
    sep = "&" if "?" in path else "?"
    while True:
        batch = api_get(f"{path}{sep}page={page}&per_page={per_page}", token)
        if not batch:
            return out
        out.extend(batch)
        if len(batch) < per_page:
            return out
        page += 1


def load_api(token):
    raw_tasks = paginate("/api/v1/tasks?sort_by[]=id&order_by[]=asc", token)
    labels = [{"id": l["id"], "title": l["title"]} for l in paginate("/api/v1/labels", token)]
    projects = [
        {"id": p["id"], "title": p["title"], "parent": p.get("parent_project_id") or 0,
         "archived": bool(p.get("is_archived")), "description": p.get("description") or ""}
        for p in api_get("/api/v1/projects", token) if p["id"] > 0
    ]
    tasks, relations = [], []
    for t in raw_tasks:
        tasks.append({
            "id": t["id"], "title": t["title"], "done": bool(t.get("done")), "due": t.get("due_date"),
            "start": t.get("start_date"), "project_id": t["project_id"], "created": t.get("created"), "updated": t.get("updated"),
            "labels": {l["id"] for l in (t.get("labels") or [])},
        })
        for kind, others in (t.get("related_tasks") or {}).items():
            for o in others or []:
                relations.append((t["id"], o["id"], kind))
    filters = []
    for p in api_get("/api/v1/projects", token):
        if p["id"] < 0:  # saved filters come through the projects list as negative ids
            try:
                f = api_get(f"/api/v1/filters/{-p['id'] - 1}", token)
                filters.append({"id": f["id"], "title": f["title"], "filter": (f.get("filters") or {}).get("filter", "")})
            except Exception:
                pass
    return {"tasks": tasks, "labels": labels, "projects": projects, "relations": relations,
            "filters": filters, "source": "api"}


# --------------------------------------------------------------------------- data checks
# Each takes the snapshot (and `today`/`now` where time matters) and returns a Result.

def check_duplicate_labels(snap, **_):
    groups = {}
    for l in snap["labels"]:
        groups.setdefault(norm(l["title"]), []).append(l)
    dups = [g for g in groups.values() if len(g) > 1]
    if not dups:
        return Result("duplicate labels", "ok", "no duplicate labels")
    return Result("duplicate labels", "warn", f"{len(dups)} label name(s) exist more than once",
                  listed([f"{g[0]['title']} ×{len(g)} (ids {', '.join(str(x['id']) for x in g)})" for g in dups]))


def check_duplicate_projects(snap, **_):
    groups = {}
    for p in snap["projects"]:
        if not p["archived"]:
            groups.setdefault((p["parent"], norm(p["title"])), []).append(p)
    dups = [g for g in groups.values() if len(g) > 1]
    if not dups:
        return Result("duplicate projects", "ok", "no duplicate projects")
    return Result("duplicate projects", "warn", f"{len(dups)} project name(s) exist twice at the same level",
                  listed([f"{g[0]['title']} ×{len(g)}" for g in dups]))


def check_duplicate_filters(snap, **_):
    groups = {}
    for f in snap["filters"]:
        groups.setdefault(norm(re.sub(r"^\s*\d+\.\s*", "", f["title"])), []).append(f)
    dups = [g for g in groups.values() if len(g) > 1]
    if not dups:
        return Result("duplicate filters", "ok", "no duplicate filters")
    return Result("duplicate filters", "warn", f"{len(dups)} filter name(s) exist more than once",
                  listed([f"{g[0]['title']} ×{len(g)}" for g in dups]))


def check_protected_labels(snap, **_):
    have = {l["id"]: norm(l["title"]) for l in snap["labels"]}
    missing = [f"{name} (id {i})" for i, name in PROTECTED.items() if have.get(i) != name]
    if not missing:
        return Result("automation labels", "ok", "next-action, today, overdue and last-day exist with the expected ids")
    return Result("automation labels", "fail", "the poller depends on label ids that are missing or renamed", missing)


def check_due_labels(snap, today=None, **_):
    """Open tasks must carry `overdue` when due before today, `last-day` when due today, neither otherwise."""
    today = today or local_today()
    ids = {name: i for i, name in PROTECTED.items()}
    od, ld = ids["overdue"], ids["last-day"]
    tz = ZoneInfo(TIMEZONE) if ZoneInfo else None
    bad = []
    for t in snap["tasks"]:
        due = parse_dt(t["due"])
        if t["done"] or not due:
            continue
        d = due.astimezone(tz).date() if tz else due.astimezone().date()
        want_od, want_ld = d < today, d == today
        if (od in t["labels"]) != want_od or (ld in t["labels"]) != want_ld:
            bad.append(f"#{t['id']} {t['title'][:50]} (due {d.isoformat()})")
    if not bad:
        return Result("due-date labels", "ok", "overdue / last-day labels match every due date")
    return Result("due-date labels", "warn", f"{len(bad)} open task(s) have the wrong overdue / last-day label (the poller fixes this within a minute)", listed(bad))


def check_done_with_active_labels(snap, **_):
    ids = {i for i, n in PROTECTED.items() if n in ACTIVE_LABELS}
    bad = [f"#{t['id']} {t['title'][:50]}" for t in snap["tasks"] if t["done"] and t["labels"] & ids]
    if not bad:
        return Result("completed tasks", "ok", "no completed task still carries an active label")
    return Result("completed tasks", "warn", f"{len(bad)} completed task(s) still carry next-action / today / overdue / last-day", listed(bad))


def check_orphans(snap, **_):
    projects = {p["id"]: p for p in snap["projects"]}
    missing = [f"#{t['id']} {t['title'][:40]} (project {t['project_id']})" for t in snap["tasks"] if t["project_id"] not in projects]
    archived = [f"#{t['id']} {t['title'][:40]}" for t in snap["tasks"]
                if not t["done"] and projects.get(t["project_id"], {}).get("archived")]
    if missing:
        return Result("task projects", "fail", f"{len(missing)} task(s) point at a project that does not exist", listed(missing))
    if archived:
        return Result("task projects", "warn", f"{len(archived)} open task(s) sit in an archived project", listed(archived))
    return Result("task projects", "ok", "every task belongs to an existing project")


def check_project_tree(snap, **_):
    byid = {p["id"]: p for p in snap["projects"]}
    broken, cycles = [], []
    for p in snap["projects"]:
        if p["parent"] and p["parent"] not in byid:
            broken.append(f"{p['title']} (parent {p['parent']} missing)")
        seen, cur = set(), p
        while cur and cur["parent"]:
            if cur["id"] in seen:
                cycles.append(p["title"])
                break
            seen.add(cur["id"])
            cur = byid.get(cur["parent"])
    if cycles:
        return Result("project tree", "fail", "the project tree contains a loop", listed(sorted(set(cycles))))
    if broken:
        return Result("project tree", "warn", f"{len(broken)} project(s) have a missing parent", listed(broken))
    return Result("project tree", "ok", "project tree is consistent")


def check_relations(snap, **_):
    ids = {t["id"] for t in snap["tasks"]}
    rels = {(a, b, k) for a, b, k in snap["relations"]}
    inverse = {"precedes": "follows", "follows": "precedes", "subtask": "parenttask", "parenttask": "subtask"}
    problems, leftovers = [], []
    for a, b, k in rels:
        if a == b:
            problems.append(f"task {a} is related to itself")
        elif a not in ids or b not in ids:
            # 'copied from / to' links are only history: a deleted copy leaves them behind, harmlessly
            (leftovers if k in ("copiedfrom", "copiedto") else problems).append(f"relation {a} {k} {b} points at a missing task")
        elif k in inverse and (b, a, inverse[k]) not in rels:
            problems.append(f"relation {a} {k} {b} has no matching {inverse[k]}")
    graph = {}
    for a, b, k in rels:
        if k == "precedes":
            graph.setdefault(a, []).append(b)
    color, cyc = {}, []

    def dfs(n, path):
        color[n] = 1
        for m in graph.get(n, []):
            if color.get(m) == 1:
                cyc.append(" → ".join(map(str, path + [n, m])))
            elif color.get(m) is None:
                dfs(m, path + [n])
        color[n] = 2

    for n in list(graph):
        if color.get(n) is None:
            dfs(n, [])
    problems += [f"cycle {c}" for c in cyc]
    if not problems and leftovers:
        return Result("relations", "info", f"{len(leftovers)} leftover copy link(s) to deleted tasks (harmless)", listed(sorted(leftovers)))
    if not problems:
        return Result("relations", "ok", "no dangling, one-sided or circular relations")
    return Result("relations", "fail" if cyc else "warn", f"{len(problems)} relation problem(s)", listed(sorted(set(problems))))


def check_missing_start(snap, now=None, **_):
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=15)
    bad = []
    for t in snap["tasks"]:
        created = parse_dt(t["created"])
        if not t["done"] and not parse_dt(t["start"]) and created and created < cutoff:
            bad.append(f"#{t['id']} {t['title'][:50]}")
    if not bad:
        return Result("start dates", "ok", "every open task has a start date")
    return Result("start dates", "info", f"{len(bad)} open task(s) have no start date (normal for tasks kept in PENDING)", listed(bad))


def check_possible_copies(snap, **_):
    """Titles like 'Plan_2' next to 'Plan' in the same project: duplicates made by accident or by testing."""
    titles = {(t["project_id"], t["title"]) for t in snap["tasks"]}
    hits = []
    for t in snap["tasks"]:
        m = re.match(r"^(.*)_(\d+)$", t["title"])
        if m and (t["project_id"], m.group(1)) in titles:
            hits.append(f"#{t['id']} {t['title'][:60]}")
    if not hits:
        return Result("possible copies", "ok", "no task looks like a copy of another")
    return Result("possible copies", "info", f"{len(hits)} task(s) look like copies (title ends with _2, _3…)", listed(hits))


def check_filters(snap, **_):
    projects = {p["id"] for p in snap["projects"]}
    labels = {l["id"] for l in snap["labels"]}
    bad = []
    for f in snap["filters"]:
        for grp in re.findall(r"project_id not in ([0-9, ]+)", f["filter"]):
            gone = [i for i in re.findall(r"\d+", grp) if int(i) not in projects]
            if gone:
                bad.append(f"{f['title']}: unknown project id(s) {', '.join(gone)}")
        for grp in re.findall(r"labels in ([0-9, ]+)", f["filter"]):
            gone = [i for i in re.findall(r"\d+", grp) if int(i) not in labels]
            if gone:
                bad.append(f"{f['title']}: unknown label id(s) {', '.join(gone)}")
    if not bad:
        return Result("saved filters", "ok", "saved filters only mention labels and projects that exist")
    return Result("saved filters", "warn", f"{len(bad)} saved filter(s) mention something that no longer exists", listed(bad))


def check_review_backlog(snap, **_):
    by = label_ids_by_title(snap["labels"])
    rid = set(by.get("ctx:review", []))
    n = sum(1 for t in snap["tasks"] if t["labels"] & rid and not t["done"])
    return Result("inbox", "info" if n else "ok", f"{n} open task(s) waiting for validation in the Inbox view")


def split_bin(snap):
    """Deleted tasks sit in a project called Bin: keep them out of every other check."""
    bin_ids = {p["id"] for p in snap["projects"] if p["title"] == "Bin" and not p["parent"]}
    snap["bin_ids"] = bin_ids
    snap["bin"] = [t for t in snap["tasks"] if t["project_id"] in bin_ids]
    snap["tasks"] = [t for t in snap["tasks"] if t["project_id"] not in bin_ids]
    # Links between tasks in the Bin come back with them when restored: not dangling.
    binned = {t["id"] for t in snap["bin"]}
    snap["relations"] = [r for r in snap["relations"] if r[0] not in binned and r[1] not in binned]
    return snap


def check_bin(snap, now=None, **_):
    now = now or datetime.now(timezone.utc)
    items = snap.get("bin") or []
    if not items:
        return Result("bin", "ok", "the Bin is empty")
    old = []
    for t in items:
        created = parse_dt(t.get("updated")) or parse_dt(t["created"])
        if created and now - created > timedelta(days=45):
            old.append(f"#{t['id']} {t['title'][:50]}")
    if old:
        return Result("bin", "warn", f"{len(old)} task(s) have been in the Bin well over 30 days (the app erases them when it syncs)", listed(old))
    return Result("bin", "info", f"{len(items)} task(s) in the Bin (kept 30 days)")


AREAS_DIR = os.environ.get("VIKUNJA_AREAS_DIR", "/Users/loudodin/Partage_One_plus_nord_CE_2/areas")
FOLDER_STATE = os.path.join(STATE_DIR, "folder_state.json")


def check_project_folders(snap, areas_dir=None, state_file=None, **_):
    """Every folder the automation recorded for a project must still exist, and every project
    inside an area should have one."""
    areas_dir = areas_dir or AREAS_DIR
    state_file = state_file or FOLDER_STATE
    if not os.path.isdir(areas_dir):
        return Result("project folders", "warn", f"the areas folder is not reachable: {areas_dir}")
    try:
        with open(state_file, encoding="utf-8") as f:
            state = json.load(f)
    except FileNotFoundError:
        return Result("project folders", "info", "the folder link has not run yet (starts on the next poll after a restart)")
    except Exception as e:
        return Result("project folders", "warn", f"folder_state.json unreadable: {e}")
    live = {str(p["id"]): p for p in snap["projects"]}
    gone = [f"{v['path']}" for k, v in state.items() if k in live and not os.path.isdir(os.path.join(areas_dir, v["path"]))]
    if gone:
        return Result("project folders", "warn", f"{len(gone)} project folder(s) were moved or renamed outside the app and will be recreated", listed(gone))
    return Result("project folders", "ok", f"{len(state)} project folders match the projects")


DATA_CHECKS = [
    check_protected_labels, check_duplicate_labels, check_duplicate_projects, check_duplicate_filters,
    check_due_labels, check_done_with_active_labels, check_orphans, check_project_tree,
    check_relations, check_filters, check_missing_start, check_possible_copies, check_review_backlog,
    check_bin, check_project_folders,
]


# --------------------------------------------------------------------------- system checks

def check_heartbeat(path=HEARTBEAT_FILE, now=None, **_):
    now = now or datetime.utcnow()
    try:
        with open(path, encoding="utf-8") as f:
            beat = datetime.strptime(f.read().strip(), "%Y-%m-%dT%H:%M:%SZ")
    except FileNotFoundError:
        return Result("poller heartbeat", "fail", "no heartbeat file: the poller has never run")
    except (ValueError, OSError):
        return Result("poller heartbeat", "fail", "heartbeat file unreadable")
    age = (now - beat).total_seconds()
    if age > HEARTBEAT_STALE_SECONDS:
        return Result("poller heartbeat", "fail", f"no heartbeat for {int(age // 60)} min: the poller is stopped")
    return Result("poller heartbeat", "ok", f"poller alive (last beat {int(age)} s ago)")


def check_recent_errors(path=ERRORS_LOG, now=None, hours=24, **_):
    now = now or datetime.now()
    recent = []
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                m = re.match(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)", line)
                if m and now - datetime.fromisoformat(m.group(1)) < timedelta(hours=hours):
                    recent.append(line.strip()[:160])
    except FileNotFoundError:
        pass
    if not recent:
        return Result("poller errors", "ok", f"no poller error in the last {hours} h")
    return Result("poller errors", "warn", f"{len(recent)} poller error(s) in the last {hours} h", listed(recent))


def check_sqlite_integrity(db_path, **_):
    c = None
    try:
        c = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        res = c.execute("pragma integrity_check").fetchall()
    except sqlite3.Error as e:
        return Result("database integrity", "fail", f"cannot check the database: {e}")
    finally:
        if c is not None:
            c.close()  # an open file cannot be deleted or replaced on Windows
    if res == [("ok",)]:
        return Result("database integrity", "ok", "SQLite integrity check passed")
    return Result("database integrity", "fail", "SQLite reports corruption", [str(r[0]) for r in res[:MAX_ITEMS]])


def check_backups(backup_dir=BACKUP_DIR, now=None, **_):
    now = now or time.time()
    try:
        files = sorted(f for f in os.listdir(backup_dir) if f.startswith("vikunja-") and f.endswith(".db"))
    except FileNotFoundError:
        files = []
    if not files:
        return Result("backups", "warn", "no database backup yet (run healthcheck.py --backup)")
    age = (now - os.path.getmtime(os.path.join(backup_dir, files[-1]))) / 3600
    if age > 48:
        return Result("backups", "warn", f"last backup is {int(age // 24)} days old")
    return Result("backups", "ok", f"{len(files)} backup(s), newest {int(age)} h old")


def check_disk(path=BASE_DIR, min_free_mb=500, **_):
    free = shutil.disk_usage(path).free / 1e6
    if free < min_free_mb:
        return Result("disk space", "fail", f"only {int(free)} MB free")
    return Result("disk space", "ok", f"{int(free / 1000)} GB free")


def check_log_size(path=POLLER_LOG, max_mb=50, **_):
    try:
        mb = os.path.getsize(path) / 1e6
    except OSError:
        return Result("poller log size", "ok", "no poller log yet")
    if mb > max_mb:
        return Result("poller log size", "warn", f"the poller log has grown to {int(mb)} MB")
    return Result("poller log size", "ok", f"poller log {mb:.1f} MB")


def check_api(token, **_):
    if not token:
        return Result("server", "fail", "no API token available")
    t0 = time.time()
    try:
        api_get("/api/v1/projects", token)
    except urllib.error.HTTPError as e:
        return Result("server", "fail", f"server answered HTTP {e.code} (token expired or revoked?)")
    except Exception as e:
        return Result("server", "fail", f"server unreachable: {e}")
    ms = int((time.time() - t0) * 1000)
    return Result("server", "warn" if ms > 3000 else "ok", f"server answers in {ms} ms")


def _backup_via_copy(db_path, dst):
    """Fallback when the live file cannot be opened for the online backup (read-only mounts,
    odd file systems): copy db + wal, let SQLite replay the wal, then back that copy up."""
    tmp = tempfile.mkdtemp(prefix="hcb_")
    try:
        copy = os.path.join(tmp, "v.db")
        shutil.copy(db_path, copy)
        for ext in ("-wal", "-shm"):
            if os.path.exists(db_path + ext):
                shutil.copy(db_path + ext, copy + ext)
        src = sqlite3.connect(copy)
        out = sqlite3.connect(os.path.join(tmp, "out.db"))
        src.backup(out)
        out.close()
        src.close()
        shutil.copy(os.path.join(tmp, "out.db"), dst)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def backup_database(db_path, backup_dir=BACKUP_DIR, keep=BACKUPS_TO_KEEP, today=None):
    """One consistent copy per day (SQLite online backup, safe while Vikunja writes; falls back
    to copying the files when the live database cannot be opened). Old copies beyond `keep` go."""
    os.makedirs(backup_dir, exist_ok=True)
    today = today or date.today()
    dst = os.path.join(backup_dir, f"vikunja-{today.isoformat()}.db")
    if os.path.exists(dst):
        return dst, False
    tmp = dst + ".tmp"
    for leftover in (tmp, tmp + "-journal"):
        try:
            os.remove(leftover)
        except OSError:
            pass
    try:
        src = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        out = sqlite3.connect(tmp)
        try:
            src.backup(out)
        finally:
            out.close()
            src.close()
        os.replace(tmp, dst)
    except sqlite3.Error:
        try:
            os.remove(tmp)
        except OSError:
            pass
        _backup_via_copy(db_path, dst)
    old = sorted(f for f in os.listdir(backup_dir) if f.startswith("vikunja-") and f.endswith(".db"))
    for f in old[:-keep]:
        os.remove(os.path.join(backup_dir, f))
    return dst, True


# --------------------------------------------------------------------------- runner

def run_checks(snap, **ctx):
    results = []
    for fn in DATA_CHECKS:
        try:
            results.append(fn(snap, **ctx))
        except Exception as e:  # one broken check must never hide the others
            results.append(Result(fn.__name__.replace("check_", "").replace("_", " "), "fail", f"the check itself crashed: {e}"))
    return results


def render(results, source=""):
    icon = {"ok": "ok  ", "info": "info", "warn": "WARN", "fail": "FAIL"}
    lines = [f"Vikunja health check — {datetime.now().strftime('%Y-%m-%d %H:%M')} ({source})", ""]
    for r in sorted(results, key=lambda r: ["fail", "warn", "info", "ok"].index(r.level)):
        lines.append(f"[{icon[r.level]}] {r.name}: {r.summary}")
        lines += [f"         - {i}" for i in r.items]
    counts = {lv: sum(1 for r in results if r.level == lv) for lv in ("fail", "warn", "info", "ok")}
    lines += ["", f"{counts['ok']} ok, {counts['info']} info, {counts['warn']} warnings, {counts['fail']} failures"]
    return "\n".join(lines)


def notify_failures(results, state_file=STATE_FILE, now=None, send=None):
    """One macOS notification per failing check, at most once every 6 h each. Returns the names notified."""
    now = now or time.time()
    try:
        with open(state_file) as f:
            state = json.load(f)
    except (OSError, ValueError):
        state = {}
    sent = []
    for r in results:
        if r.level != "fail":
            state.pop(r.name, None)  # recovered: alert again immediately next time
            continue
        last = state.get(r.name)
        if last is not None and now - last < NOTIFY_COOLDOWN_SECONDS:
            continue
        state[r.name] = now
        sent.append(r.name)
        if send:
            send("Vikunja health check", f"{r.name}: {r.summary}")
    try:
        with open(state_file, "w") as f:
            json.dump(state, f)
    except OSError:
        pass
    return sent


def mac_notify(title, message):
    if sys.platform != "darwin":
        return
    import subprocess
    esc = lambda s: s.replace("\\", "\\\\").replace('"', '\\"')
    try:
        subprocess.run(["osascript", "-e", f'display notification "{esc(message)[:250]}" with title "{esc(title)}" sound name "Basso"'],
                       timeout=5, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


def run_all(mode, db_path=None, token=None):
    results = []
    if mode == "api":
        token = token or read_token()
        results.append(check_api(token))
        snap = load_api(token) if results[-1].level != "fail" else None
    else:
        db_path = db_path or pick_db_path()
        snap = load_sqlite(db_path)
    if snap:
        snap = split_bin(snap)
        results += run_checks(snap)
    results += [check_heartbeat(), check_recent_errors(), check_backups(), check_disk(), check_log_size()]
    try:
        dbp = db_path or pick_db_path()
        results.append(check_sqlite_integrity(dbp))
    except FileNotFoundError:
        pass
    return results


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group()
    src.add_argument("--api", action="store_true", help="read through the HTTP API (default)")
    src.add_argument("--db", metavar="PATH", help="read from a SQLite database file")
    ap.add_argument("--notify", action="store_true", help="macOS notification for failures")
    ap.add_argument("--backup", action="store_true", help="copy the database into backups/")
    ap.add_argument("--json", action="store_true", help="print JSON instead of text")
    args = ap.parse_args(argv)

    if args.backup:
        path, made = backup_database(args.db or pick_db_path())
        print(("backup written: " if made else "backup already exists: ") + path)
        return 0
    results = run_all("db" if args.db else "api", db_path=args.db)
    try:
        with open(REPORT_FILE, "w") as f:
            json.dump({"at": datetime.now().isoformat(), "results": [asdict(r) for r in results]}, f, indent=1)
    except OSError:
        pass
    if args.notify:
        notify_failures(results, send=mac_notify)
    print(json.dumps([asdict(r) for r in results], indent=1) if args.json else render(results, "database" if args.db else "API"))
    return 1 if any(r.level == "fail" for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
