"""Keeps one local folder per Vikunja project, laid out like the to-do app:

    areas/<AREA>/<YYMMDD>_<project>/<YYMMDD>_<sub-project>
    areas/<AREA>/pending_projects/<project>
    areas/<AREA>/archived_projects/<YYMMDD start>_<YYMMDD end>_<project>

An AREA is a top-level project with an UPPER CASE title (HEALTH, PHD, ...). The state of a
project (pending / archived / dates) comes from hidden lines at the top of its description,
written by the app: [pending] [start:YYYY-MM-DD] [end:YYYY-MM-DD].

Safety rules: this module only ever creates folders and renames/moves folders it can tie to
a project. It never deletes anything, never overwrites (a name clash is reported and left
alone) and never touches a folder that does not belong to a project.
"""
import json
import os
import re
import unicodedata
from datetime import datetime

PENDING_DIR = "pending_projects"
ARCHIVED_DIR = "archived_projects"
IGNORED_TITLES = {"INBOX", "SINGLE TASKS", "PENDING", "BIN"}
STATUS_DIRS = {"pending": PENDING_DIR, "archived": ARCHIVED_DIR}

_META_LINE = re.compile(r"^[ \t]*\[(pending|start:\d{4}-\d{2}-\d{2}|end:\d{4}-\d{2}-\d{2}|ctx:(?:pro|perso))\][ \t]*(?:\r?\n|$)", re.I)


def parse_meta(description):
    meta = {"pending": False, "start": None, "end": None}
    rest = description or ""
    for _ in range(8):
        m = _META_LINE.match(rest)
        if not m:
            break
        tag = m.group(1).lower()
        if tag == "pending":
            meta["pending"] = True
        elif tag.startswith("start:"):
            meta["start"] = tag[6:]
        elif tag.startswith("end:"):
            meta["end"] = tag[4:]
        rest = rest[m.end():]
    return meta


def nfc(s):
    return unicodedata.normalize("NFC", s)


def safe_name(title):
    name = re.sub(r'[\\/:*?"<>|]', "-", nfc(title)).strip().rstrip(".")
    return name or "untitled"


def yymmdd(iso_or_ymd):
    """'2026-10-08' or an ISO timestamp -> '261008' (local date for timestamps)."""
    s = iso_or_ymd
    if len(s) == 10:
        return s[2:4] + s[5:7] + s[8:10]
    d = datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone().date()
    return d.strftime("%y%m%d")


def is_zero(iso):
    return not iso or iso.startswith("0001-01-01")


def is_area(p):
    return not p.get("parent_project_id") and p["title"].isupper()


def status_of(p, meta):
    if p.get("is_archived"):
        return "archived"
    if meta["pending"]:
        return "pending"
    return "active"


def _prefix_dates(basename):
    m = re.match(r"^((?:\d{6}_){1,2})", basename)
    return re.findall(r"\d{6}", m.group(1)) if m else []


def _strip_dates(basename):
    return re.sub(r"^(?:\d{6}_){1,2}", "", basename)


def fresh_name(p, meta, status, today_ymd, prev=None):
    """Name for a folder entering `status`. `prev` = the existing folder's basename, whose
    dates are reused when moving between states."""
    title = safe_name(p["title"])
    old = _prefix_dates(prev) if prev else []
    created = yymmdd(p["created"]) if not is_zero(p.get("created")) else today_ymd
    if status == "pending":
        return title
    if status == "active":
        if meta["start"]:
            start = yymmdd(meta["start"])
        elif old:
            start = old[0]
        elif prev and _strip_dates(prev) == prev:
            start = today_ymd  # left the pending list without a recorded start date
        else:
            start = created
        return f"{start}_{title}"
    # archived
    start = old[0] if old else (yymmdd(meta["start"]) if meta["start"] else created)
    end = yymmdd(meta["end"]) if meta["end"] else (yymmdd(p["updated"]) if not is_zero(p.get("updated")) else today_ymd)
    return f"{start}_{end}_{title}"


def desired_paths(projects):
    """project id -> (area_title, [folder-segment spec ...], status) for every project that
    deserves a folder. Specs are (project, status) pairs, turned into names later."""
    by_id = {p["id"]: p for p in projects}
    out = {}
    root_pending = next((p for p in projects if p["title"].upper() == "PENDING" and not p.get("parent_project_id")), None)

    def chain(p):
        c, seen = [], set()
        while p is not None and p["id"] not in seen:
            seen.add(p["id"])
            c.append(p)
            pid = p.get("parent_project_id")
            p = by_id.get(pid) if pid else None
        return list(reversed(c))

    for p in projects:
        if p["id"] < 0 or p["title"].upper() in IGNORED_TITLES:
            continue
        c = chain(p)
        legacy_pending = False
        if root_pending is not None and c and c[0]["id"] == root_pending["id"]:
            c = c[1:]  # old PENDING tree: PENDING/<AREA>/<project> means "pending project of <AREA>"
            legacy_pending = True
        if not c or not c[0]["title"].isupper() or (c[0].get("parent_project_id") and not legacy_pending):
            continue  # not inside an area: no folder
        if any(x["title"].upper() in IGNORED_TITLES for x in c):
            continue
        if len(c) == 1:
            out[p["id"]] = (c[0]["title"], [], "area")
            continue
        specs = []
        anchored = None
        for q in c[1:]:
            st = status_of(q, parse_meta(q.get("description")))
            if legacy_pending and st == "active":
                st = "pending"
            if anchored:
                st = anchored  # everything below a pending / archived project follows it
            elif st in STATUS_DIRS:
                anchored = st
            specs.append((q, st))
        out[p["id"]] = (c[0]["title"], specs, anchored or "active")
    return out


class Sync:
    def __init__(self, areas_dir, state_file, log=print, notify=None, today=None, apply=True):
        self.root = areas_dir
        self.state_file = state_file
        self.log = log
        self.notify = notify or (lambda kind, msg: log(f"[{kind}] {msg}"))
        self.today = today or datetime.now().strftime("%y%m%d")
        self.apply = apply
        self.actions = []
        self.state = {}
        try:
            with open(state_file) as f:
                self.state = json.load(f)
        except Exception:
            self.state = {}
        self.moved = []  # (old_abs, new_abs) renames done this run

    # ---- helpers
    def _translate(self, path):
        for old, new in self.moved:
            if path == old or path.startswith(old + os.sep):
                path = new + path[len(old):]
        return path

    def _save(self):
        if not self.apply:
            return
        tmp = self.state_file + ".tmp"
        with open(tmp, "w") as f:
            json.dump(self.state, f, indent=1, ensure_ascii=False)
        os.replace(tmp, self.state_file)

    def _find(self, area_dir, title, claimed):
        """Existing folders inside the area whose name is [dates_]title."""
        pat = re.compile(r"^(?:\d{6}_){0,2}" + re.escape(nfc(safe_name(title))) + r"$")
        found = []
        base_depth = area_dir.rstrip(os.sep).count(os.sep)
        for dirpath, dirnames, _ in os.walk(area_dir):
            if dirpath.count(os.sep) - base_depth >= 4:
                dirnames[:] = []
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            for d in dirnames:
                full = os.path.join(dirpath, d)
                if pat.match(nfc(d)) and full not in claimed:
                    found.append(full)
        return sorted(found)

    def _record(self, pid, path, status, title):
        self.state[str(pid)] = {"path": os.path.relpath(path, self.root), "status": status, "title": title}

    # ---- main
    def run(self, projects):
        if not os.path.isdir(self.root):
            self.notify("folders", f"Areas folder not found, nothing done: {self.root}")
            return self.actions
        plan = desired_paths(projects)
        by_id = {p["id"]: p for p in projects}
        claimed = set()
        for k, v in self.state.items():
            claimed.add(os.path.join(self.root, v["path"]))

        order = sorted(plan, key=lambda i: len(plan[i][1]))
        for pid in order:
            p = by_id[pid]
            try:
                self._one(p, plan[pid], claimed)
            except Exception as e:  # one bad project must not stop the others
                self.notify("folders", f"project {pid} ({p.get('title')}): {e}")
        self._save()
        return self.actions

    def _one(self, p, plan, claimed):
        area_title, specs, status = plan
        area_dir = os.path.join(self.root, self._area_folder(area_title))
        if not os.path.isdir(area_dir):
            self._do("mkdir", None, area_dir)
        if not specs:
            return
        meta = parse_meta(p.get("description"))
        # current folder: from state (translated through this run's renames), else by name
        cur, prev_status, prev_title = None, None, None
        st = self.state.get(str(p["id"]))
        if st:
            c = self._translate(os.path.join(self.root, st["path"]))
            if os.path.isdir(c):
                cur, prev_status, prev_title = c, st["status"], st["title"]
        if cur is None:
            cands = self._find(area_dir, p["title"], claimed - {None})
            if len(cands) == 1:
                cur = cands[0]
                claimed.add(cur)
            elif len(cands) > 1:
                self.notify("folders", f"{len(cands)} folders could belong to “{p['title']}”: left alone. Move or rename the extra ones.")
                return

        # parent directory + own name
        parent_dir = self._parent_dir(area_dir, specs, p)
        if parent_dir is None:
            return
        own_status = specs[-1][1]
        title = p["title"]
        if cur is not None:
            base = os.path.basename(cur)
            if prev_status == own_status or (prev_status is None and self._matches_status(cur, area_dir, own_status)):
                name = base
                if prev_title and prev_title != title:
                    a, b = safe_name(prev_title), safe_name(title)
                    if _strip_dates(base) == a:
                        name = base[: len(base) - len(a)] + b
            else:
                name = fresh_name(p, meta, own_status, self.today, prev=base)
        else:
            name = fresh_name(p, meta, own_status, self.today)
        target = os.path.join(parent_dir, name)

        if cur is None:
            if os.path.exists(target):
                cur = target
            else:
                self._do("mkdir", None, target)
                cur = target
        elif nfc(cur) != nfc(target):
            if os.path.exists(target):
                self.notify("folders", f"Cannot move “{os.path.basename(cur)}” to {os.path.relpath(target, self.root)}: a folder with that name already exists. Left in place.")
                self._record(p["id"], cur, prev_status or own_status, title)
                return
            self._do("move", cur, target)
            self.moved.append((cur, target))
            cur = target
        claimed.add(cur)
        self._record(p["id"], cur, own_status, title)

    def _matches_status(self, cur, area_dir, status):
        rel = os.path.relpath(cur, area_dir).split(os.sep)
        in_pending = PENDING_DIR in rel[:-1]
        in_archived = ARCHIVED_DIR in rel[:-1]
        if status == "pending":
            return in_pending
        if status == "archived":
            return in_archived
        return not in_pending and not in_archived

    def _area_folder(self, area_title):
        want = nfc(area_title)
        for d in sorted(os.listdir(self.root)):
            if nfc(d) == want and os.path.isdir(os.path.join(self.root, d)):
                return d
        return safe_name(area_title)

    def _parent_dir(self, area_dir, specs, p):
        """Folder that must contain this project's folder."""
        # Walk from the area down to the project's parent, using each ancestor's real folder.
        by_state = self.state
        anchor_idx = next((i for i, (q, st) in enumerate(specs) if st in STATUS_DIRS), None)
        if anchor_idx is not None and anchor_idx == len(specs) - 1:
            return os.path.join(area_dir, STATUS_DIRS[specs[-1][1]])
        if len(specs) == 1:
            return area_dir
        parent = specs[-2][0]
        st = by_state.get(str(parent["id"]))
        if not st:
            return None  # parent folder not placed yet (it will be on the next pass)
        path = os.path.join(self.root, st["path"])
        path = self._translate(path)
        return path if os.path.isdir(path) or not self.apply else path

    def _do(self, kind, src, dst):
        self.actions.append((kind, src, dst))
        if kind == "mkdir":
            self.log(f"Created folder {os.path.relpath(dst, self.root)}")
            if self.apply:
                os.makedirs(dst, exist_ok=True)
        else:
            self.log(f"Moved folder {os.path.relpath(src, self.root)} -> {os.path.relpath(dst, self.root)}")
            if self.apply:
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                os.rename(src, dst)
